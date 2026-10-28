import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../src/app";
import { AppDataSource } from "../src/data-source";
import { clearOutbox, readOutbox } from "../src/mailer/mailer";
import { nextMidnightUtc, } from "../src/services/quota.service";
import { haversineKm, resolveExactName } from "../src/services/cities.service";
import { redisReady } from "../src/lib/redis";
import type { Express } from "express";

const PNG_1PX = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);
const uid = () => `d-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;

let app: Express;

beforeAll(async () => {
  app = await buildApp();
  const r = await redisReady();
  const rlKeys = await r.keys("rl:*");
  if (rlKeys.length > 0) await r.del(...rlKeys);
  const qKeys = await r.keys("q:*");
  if (qKeys.length > 0) await r.del(...qKeys);
});
afterAll(async () => {
  await AppDataSource.query("TRUNCATE users, refresh_tokens, profiles, preferences, photos, swipes, matches, blocks CASCADE");
  await AppDataSource.destroy();
});
beforeEach(() => clearOutbox());

/** Crée un utilisateur vérifié avec profil complet + 1 photo approuvée. Renvoie le token. */
async function fullUser(name: string, kind: "femme" | "homme", seeking: "femme" | "homme" | "tous", birthDate = "1995-06-15", geo?: { commune: string; insee: string }): Promise<string> {
  clearOutbox(); // l'outbox est un module partagé entre fichiers — purge pour matcher NOTRE mail
  const email = `${name}-${uid()}@example.fr`;
  const reg = await request(app).post("/api/auth/register").send({ email, password: "motdepasse1", birthDate });
  expect(reg.status).toBe(201);
  const link = readOutbox().find((m) => m.text.includes("/verify-email?token="))!;
  const token = link.text.match(/token=([\w.-]+)/)![1]!;
  const verify = await request(app).post("/api/auth/verify-email").send({ token });
  expect(verify.status).toBe(200);
  // login APRÈS vérification : claims email_verified à jour
  const loginRes = await request(app).post("/api/auth/login").send({ email, password: "motdepasse1" });
  const auth = { Authorization: `Bearer ${loginRes.body.data.accessToken}` };
  await request(app).put("/api/me/profile").set(auth).send({
    displayName: name, intention: "a_voir", gender: kind, seeking,
    commune: geo?.commune ?? "Paris", communeInsee: geo?.insee ?? null, bio: null,
  });
  const up = await request(app).post("/api/me/photos").set(auth).attach("photo", PNG_1PX, { filename: "a.png" });
  expect(up.status).toBe(201);
  // re-login pour un access token avec claims frais
  const login2 = await request(app).post("/api/auth/login").send({ email, password: "motdepasse1" });
  return login2.body.data.accessToken;
}

describe("M2 — quotas & reset DST", () => {
  it("nextMidnightUtc : hiver (UTC+1)", () => {
    const got = nextMidnightUtc(new Date("2026-01-15T23:00:30Z"));
    expect(got.toISOString()).toMatch(/^2026-01-16T22:5[89]|2026-01-16T23:0[01]/);
  });
  it("nextMidnightUtc : été (UTC+2)", () => {
    const got = nextMidnightUtc(new Date("2026-07-15T22:00:30Z"));
    expect(got.toISOString()).toMatch(/^2026-07-16T21:5[89]|2026-07-16T22:0[01]/);
  });
});

describe("M2 — deck & swipe & match", () => {
  let aliceTok: string;
  let bobTok: string;
  let bobProfileId: string;
  let aliceProfileId: string;

  beforeAll(async () => {
    aliceTok = await fullUser("Alice", "femme", "homme");
    bobTok = await fullUser("Bob", "homme", "femme");
    await fullUser("Charlie", "homme", "femme"); // fixture homme (deck d'Alice), son token n'est pas nécessaire
    await fullUser("Diane", "femme", "femme"); // femme : hors deck d'Alice (elle cherche un homme)
    void aliceProfileId;
  });

  it("deck d'Alice contient Bob (filles cherchant hommes ↔ hommes cherchant femmes)", async () => {
    const res = await request(app).get("/api/deck").set({ Authorization: `Bearer ${aliceTok}` });
    expect(res.status).toBe(200);
    expect(res.body.data.reason).toBe("ok");
    const cards = res.body.data.cards;
    const bob = cards.find((c: { displayName: string }) => c.displayName === "Bob");
    expect(bob).toBeTruthy();
    expect(bob.age).toBeGreaterThanOrEqual(18);
    expect(bob.mainUrl).toMatch(/^\/uploads\//);
    bobProfileId = bob.profileId;
    // les quotas sont présents et Alice démarre à 25/1
    expect(res.body.data.quotas.likes).toBe(25);
    expect(res.body.data.quotas.superlikes).toBe(1);
  });

  it("deck d'Alice : seulement des hommes — pas Diane, pas elle-même", async () => {
    const res = await request(app).get("/api/deck").set({ Authorization: `Bearer ${aliceTok}` });
    const names = res.body.data.cards.map((c: { displayName: string }) => c.displayName);
    expect(names).not.toContain("Diane");
    expect(names).not.toContain("Alice");
    expect(names.length).toBeGreaterThanOrEqual(2); // Bob + Charlie
  });

  it("swipe like sans réciprocité → pas de match ; réciprocité → match idempotent", async () => {
    const s1 = await request(app).post("/api/swipe").set({ Authorization: `Bearer ${aliceTok}` }).send({ targetProfileId: bobProfileId, action: "like" });
    expect(s1.status).toBe(200);
    expect(s1.body.data.matched).toBe(false);
    expect(s1.body.data.quotas.likes).toBe(24);

    const bobRes = await request(app).get("/api/deck").set({ Authorization: `Bearer ${bobTok}` });
    const bobCards = bobRes.body.data.cards;
    const aliceCard = bobCards.find((c: { displayName: string }) => c.displayName === "Alice");
    aliceProfileId = aliceCard.profileId;

    const s2 = await request(app).post("/api/swipe").set({ Authorization: `Bearer ${bobTok}` }).send({ targetProfileId: aliceProfileId, action: "like" });
    expect(s2.status).toBe(200);
    expect(s2.body.data.matched).toBe(true);
    expect(s2.body.data.match.otherProfile.displayName).toBe("Alice");

    // idempotence : re-like → 409 (même paire déjà swipée), pas 2 matchs
    const s3 = await request(app).post("/api/swipe").set({ Authorization: `Bearer ${bobTok}` }).send({ targetProfileId: aliceProfileId, action: "like" });
    expect(s3.status).toBe(409);

    const matches = await request(app).get("/api/matches").set({ Authorization: `Bearer ${aliceTok}` });
    expect(matches.body.data).toHaveLength(1);
    expect(matches.body.data[0].otherProfile.displayName).toBe("Bob");
  });

  it("le deck n'expose plus un profil matché", async () => {
    const res = await request(app).get("/api/deck").set({ Authorization: `Bearer ${aliceTok}` });
    const names = res.body.data.cards.map((c: { displayName: string }) => c.displayName);
    expect(names).not.toContain("Bob");
  });

  it("super-like : 1/jour — le 2e → 403 ; il place l'auteur en tête du deck", async () => {
    const xTok = await fullUser("Xenia", "femme", "homme");
    const y1Tok = await fullUser("Yann", "homme", "femme");
    await fullUser("Yves", "homme", "femme", "1999-01-15"); // 27 ans

    const xAuth = { Authorization: `Bearer ${xTok}` };
    const deck = await request(app).get("/api/deck").set(xAuth);
    const deckCards: Array<{ profileId: string; displayName: string; superlikedMe: boolean }> = deck.body.data.cards;
    const yann = deckCards.find((c) => c.displayName === "Yann")!;
    const yves = deckCards.find((c) => c.displayName === "Yves")!;
    expect(yann && yves).toBeTruthy(); // deux cibles valides pour le super-like

    const s1 = await request(app).post("/api/swipe").set(xAuth).send({ targetProfileId: yann.profileId, action: "superlike" });
    expect(s1.status).toBe(200);
    expect(s1.body.data.quotas.superlikes).toBe(0);

    const s2 = await request(app).post("/api/swipe").set(xAuth).send({ targetProfileId: yves.profileId, action: "superlike" });
    expect(s2.status).toBe(403);
    expect(s2.body.code).toBe("QUOTA_SUPERLIKES");

    // Yann voit Xenia EN TÊTE de son deck avec le bandeau ⚡ (F3 : le reçu priorise)
    const deckYann = await request(app).get("/api/deck").set({ Authorization: `Bearer ${y1Tok}` });
    expect(deckYann.body.data.cards[0]?.displayName).toBe("Xenia");
    expect(deckYann.body.data.cards[0]?.superlikedMe).toBe(true);

    // Régression âge (le bug M2 : myAgeMin/myAgeMax mal cablés ne filtrait rien).
    // NB : Yann a disparu du deck — Xenia l'a déjà superswipeé (<30 j, exclusion voulue).
    // On crée Zach (30 ans, jamais swipé) pour prouver l'inclusion dans la fenêtre.
    await fullUser("Zach", "homme", "femme", "1996-02-02");
    await request(app).put("/api/me/preferences").set(xAuth).send({ ageMin: 28, ageMax: 99, distanceKm: 160 });
    const deck2 = await request(app).get("/api/deck").set(xAuth);
    const names = deck2.body.data.cards.map((c: { displayName: string }) => c.displayName);
    expect(names).toContain("Zach"); // 30 ans ✓ dans [28..99]
    expect(names).not.toContain("Yves"); // 27 ans < ageMin 28
    expect(names).not.toContain("Yann"); // déjà superswipé (exclusion 30 j)
  });

  it("non-vérifié : deck refusé 403", async () => {
    const email = `gate-${uid()}@example.fr`;
    await request(app).post("/api/auth/register").send({ email, password: "motdepasse1", birthDate: "1995-06-15" });
    const loginRes = await request(app).post("/api/auth/login").send({ email, password: "motdepasse1" });
    const res = await request(app).get("/api/deck").set({ Authorization: `Bearer ${loginRes.body.data.accessToken}` });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe("EMAIL_NOT_VERIFIED");
  });

  it("self-swipe et cible inconnue proprement refusés", async () => {
    const me = await request(app).get("/api/me/profile").set({ Authorization: `Bearer ${aliceTok}` });
    void me;
    const selfRes = await request(app).post("/api/swipe").set({ Authorization: `Bearer ${aliceTok}` }).send({ targetProfileId: me.body.data.profile === null ? "00000000-0000-0000-0000-000000000000" : "00000000-0000-0000-0000-000000000000", action: "like" });
    expect([404, 400]).toContain(selfRes.status);
    const unknown = await request(app).post("/api/swipe").set({ Authorization: `Bearer ${aliceTok}` }).send({ targetProfileId: "00000000-0000-0000-0000-000000000000", action: "like" });
    expect(unknown.status).toBe(404);
  });
});


describe("M2.5 — géo", () => {
  it("haversine : Reims ↔ Lille ≈ 107 km", () => {
    const d = haversineKm(49.2583, 4.0317, 50.6292, 3.0573);
    expect(d).toBeGreaterThan(155);
    expect(d).toBeLessThan(175);
  });

  it("deck avec distance : rayon 30 km exclut Marseille (~48 km de Toulon), 160 km l'inclut", async () => {
    // centroïdes en cache AVANT les profils (la CTE JOINe cities)
    const toulon = await resolveExactName("Toulon");
    const marseille = await resolveExactName("Marseille");
    expect(toulon && marseille).toBeTruthy();

    const xTok = await fullUser("Gina", "femme", "homme", "1995-06-15", { commune: "Toulon", insee: toulon!.insee });
    await fullUser("Hugo", "homme", "femme", "1995-06-15", { commune: "Marseille", insee: marseille!.insee });

    const auth = { Authorization: `Bearer ${xTok}` };
    await request(app).put("/api/me/preferences").set(auth).send({ ageMin: 18, ageMax: 99, distanceKm: 30 });
    const far = await request(app).get("/api/deck").set(auth);
    const names = far.body.data.cards.map((c: { displayName: string }) => c.displayName);
    expect(names).not.toContain("Hugo"); // ~48 km > 30

    await request(app).put("/api/me/preferences").set(auth).send({ ageMin: 18, ageMax: 99, distanceKm: 160 });
    const near = await request(app).get("/api/deck").set(auth);
    const hugo = near.body.data.cards.find((c: { displayName: string }) => c.displayName === "Hugo");
    expect(hugo).toBeTruthy();
    expect(hugo.distanceKm).toBeGreaterThanOrEqual(45);
    expect(hugo.distanceKm).toBeLessThanOrEqual(55);
  });
});
