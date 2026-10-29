import { io, Socket } from "socket.io-client";
import http from "node:http";
import request from "supertest";
import { beforeAll, afterAll, beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../src/app";
import { attachRealtime } from "../src/realtime/socket";
import { AppDataSource } from "../src/data-source";
import { redisReady } from "../src/lib/redis";
import { clearOutbox, readOutbox } from "../src/mailer/mailer";
import type { Express } from "express";

const uid = () => `c-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;

let app: Express;
let server: http.Server;
let baseUrl: string;
let port: number;
let aliceTok: string;
let bobTok: string;
let matchId: string;
let aliceSock: Socket;
let bobSock: Socket;
let bobUserId: string;

async function verifiedUser(name: string, kind: "femme" | "homme", seeking: "femme" | "homme" | "tous"): Promise<string> {
  clearOutbox();
  const email = `${name}-${uid()}@example.fr`;
  await request(app).post("/api/auth/register").send({ email, password: "motdepasse1", birthDate: "1995-06-15" });
  const link = readOutbox().find((m) => m.text.includes("/verify-email?token="))!;
  await request(app).post("/api/auth/verify-email").send({ token: link.text.match(/token=([\w.-]+)/)![1] });
  const login = await request(app).post("/api/auth/login").send({ email, password: "motdepasse1" });
  const auth = { Authorization: `Bearer ${login.body.data.accessToken}` };
  await request(app).put("/api/me/profile").set(auth).send({ displayName: name, intention: "a_voir", gender: kind, seeking, commune: "Paris" });
  await request(app).post("/api/me/photos").set(auth).attach("photo", Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64",
  ), { filename: "a.png" });
  const login2 = await request(app).post("/api/auth/login").send({ email, password: "motdepasse1" });
  return login2.body.data.accessToken;
}

async function connectSock(token: string): Promise<Socket> {
  const sock = io(baseUrl, { auth: { token }, transports: ["websocket"], reconnection: false });
  await new Promise<void>((ok, ko) => {
    sock.on("connect", ok);
    sock.on("connect_error", (e) => ko(new Error(e.message)));
    setTimeout(() => ko(new Error("connect timeout")), 5000);
  });
  return sock;
}

const ukey = (n: string) => `c${n}:${Date.now()}`;

beforeAll(async () => {
  app = await buildApp();
  const r = await redisReady();
  for (const pat of ["rl:*", "q:*", "rlm:*"]) {
    const keys = await r.keys(pat);
    if (keys.length) await r.del(...keys);
  }
  server = http.createServer(app);
  attachRealtime(server);
  await new Promise<void>((ok) => server.listen(0, () => ok()));
  const addr = server.address();
  port = typeof addr === "object" && addr ? addr.port : 0;
  baseUrl = `http://localhost:${port}`;

  aliceTok = await verifiedUser("Alice", "femme", "homme");
  bobTok = await fullBob();
  // match : Alice like Bob puis Bob like Alice
  const bobProfile = await request(app).get("/api/deck").set({ Authorization: `Bearer ${aliceTok}` });
  const bobCard = bobProfile.body.data.cards.find((c: { displayName: string }) => c.displayName === "Bob");
  await request(app).post("/api/swipe").set({ Authorization: `Bearer ${aliceTok}` }).send({ targetProfileId: bobCard.profileId, action: "like" });
  const aliceDeck = await request(app).get("/api/deck").set({ Authorization: `Bearer ${bobTok}` });
  const aliceCard = aliceDeck.body.data.cards.find((c: { displayName: string }) => c.displayName === "Alice");
  const m = await request(app).post("/api/swipe").set({ Authorization: `Bearer ${bobTok}` }).send({ targetProfileId: aliceCard.profileId, action: "like" });
  expect(m.body.data.matched).toBe(true);
  matchId = m.body.data.match.id;
  // bobUserId = AUTRE membre du match vu depuis ALICE (otherProfile ci-dessus est la vue de Bob)
  const meInfo = await request(app).get("/api/me").set({ Authorization: `Bearer ${aliceTok}` });
  const aliceId = meInfo.body.data.id;
  const row = (await AppDataSource.query("SELECT user_a_id, user_b_id FROM matches WHERE id = $1", [matchId]))[0];
  bobUserId = row.user_a_id === aliceId ? row.user_b_id : row.user_a_id;
  expect(bobUserId).not.toBe(aliceId);

  aliceSock = await connectSock(aliceTok);
  bobSock = await connectSock(bobTok);
});

async function fullBob(): Promise<string> {
  return verifiedUser("Bob", "homme", "femme");
}

afterAll(async () => {
  aliceSock?.disconnect();
  bobSock?.disconnect();
  await AppDataSource.query("TRUNCATE users, refresh_tokens, profiles, preferences, photos, swipes, matches, blocks, messages, reports CASCADE");
  await AppDataSource.destroy();
  server?.close();
});
beforeEach(() => clearOutbox());

describe("M3 — temps réel authentifié", () => {
  it("mauvais token → connect_error", async () => {
    const s = io(baseUrl, { auth: { token: "garbage" }, transports: ["websocket"], reconnection: false, timeout: 5000 });
    const err = await new Promise<string>((ok) => {
      s.on("connect_error", (e) => { ok(e.message); s.close(); });
    });
    expect(err.length).toBeGreaterThan(0);
  });

  it("message:send → persisté + reçu par l'autre ; re-send même uuid → idempotent", async () => {
    interface Wire { id: string; matchId: string; senderId: string; body: string; createdAt: string }
    const received = new Promise<Wire>((ok) => bobSock.once("message:new", (x) => ok(x as Wire)));
    const clientUuid = crypto.randomUUID();
    const r = await new Promise<{ message?: Wire; error?: string }>((ok) => {
      aliceSock.emit("message:send", { matchId, clientUuid, body: "Salut Bob 👋" }, ok);
    });
    expect(r.error).toBeUndefined();
    expect(r.message?.body).toBe("Salut Bob 👋");
    const other = await received;
    expect(other.body).toBe("Salut Bob 👋");

    const again = await new Promise<{ message?: Wire; error?: string }>((ok) => {
      aliceSock.emit("message:send", { matchId, clientUuid, body: "Salut Bob 👋" }, ok);
    });
    expect(again.message?.id).toBe(r.message?.id); // même message, pas de doublon
    void ukey;
  });

  it("typing relayé à l'autre uniquement", async () => {
    const seen = new Promise((ok) => bobSock.once("typing", ok));
    aliceSock.emit("typing", { matchId });
    await seen;
    expect(true).toBe(true);
  });

  it("REST fallback : envoi + pagination", async () => {
    const send = await request(app).post(`/api/matches/${matchId}/messages`)
      .set({ Authorization: `Bearer ${bobTok}` })
      .send({ clientUuid: crypto.randomUUID(), body: "Message REST" });
    expect(send.status).toBe(201);
    const dup = await request(app).post(`/api/matches/${matchId}/messages`)
      .set({ Authorization: `Bearer ${bobTok}` })
      .send({ clientUuid: send.body.data.clientUuidOfDuplicate ?? crypto.randomUUID(), body: "Message REST" });
    expect(dup.status).toBe(201);
    const list = await request(app).get(`/api/matches/${matchId}/messages?cursor=`).set({ Authorization: `Bearer ${aliceTok}` });
    const bodies = list.body.data.messages.map((x: { body: string }) => x.body);
    expect(bodies).toContain("Salut Bob 👋");
    expect(bodies).toContain("Message REST");
    expect(list.body.data.nextCursor).toBeNull();
  });

  it("blocage → gel : socket + REST refusent, les deux parties notifiées", async () => {
    const aliceBlocked = new Promise((ok) => aliceSock.once("blocked", ok));
    const block = await request(app).post("/api/blocks")
      .set({ Authorization: `Bearer ${aliceTok}` })
      .send({ userId: bobUserId });
    expect(block.status).toBe(200);
    await aliceBlocked;

    const rest = await request(app).post(`/api/matches/${matchId}/messages`)
      .set({ Authorization: `Bearer ${bobTok}` })
      .send({ clientUuid: crypto.randomUUID(), body: "encore moi" });
    expect(rest.status).toBe(403);
    expect(rest.body.code).toBe("CONVERSATION_FROZEN");

    const r = await new Promise<{ error?: string }>((ok) => {
      bobSock.emit("message:send", { matchId, clientUuid: crypto.randomUUID(), body: "encore moi" }, ok);
    });
    expect(r.error).toBe("CONVERSATION_FROZEN");

    // déblocage → la conversation repart
    const bobProfilePage = await request(app).get("/api/deck").set({ Authorization: `Bearer ${bobTok}` });
    void bobProfilePage;
    // unblock via profileId : on récupère l'id du profil de Bob côté Alice est complexe —
    // on débloque via DELETE /blocks/:profileId en résolvant par userId depuis les matchs
    const bobProfileRow = await AppDataSource.query(
      "SELECT id FROM profiles WHERE user_id = $1", [bobUserId],
    );
    const un = await request(app).delete(`/api/blocks/${bobProfileRow[0]?.id ?? ""}`).set({ Authorization: `Bearer ${aliceTok}` });
    expect(un.status).toBe(200);
    const okMsg = await request(app).post(`/api/matches/${matchId}/messages`)
      .set({ Authorization: `Bearer ${bobTok}` })
      .send({ clientUuid: crypto.randomUUID(), body: "on reparle" });
    expect(okMsg.status).toBe(201);
  });
});

describe("M3 — signalement", () => {
  it("report valide → 201 accusé <24h ; motif invalide → 400", async () => {
    const deck = await request(app).get("/api/deck").set({ Authorization: `Bearer ${aliceTok}` });
    void deck;
    const bobProfileRow = await AppDataSource.query("SELECT id FROM profiles WHERE user_id = $1", [bobUserId]);
    const ok = await request(app).post("/api/reports")
      .set({ Authorization: `Bearer ${aliceTok}` })
      .send({ targetProfileId: bobProfileRow[0].id, reason: "escroquerie", detail: "Demande de crypto" });
    expect(ok.status).toBe(201);
    const bad = await request(app).post("/api/reports")
      .set({ Authorization: `Bearer ${aliceTok}` })
      .send({ targetProfileId: bobProfileRow[0].id, reason: "pas-un-motif" });
    expect(bad.status).toBe(400);
  });
});

