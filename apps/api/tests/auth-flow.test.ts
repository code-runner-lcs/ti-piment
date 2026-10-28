import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../src/app";
import { AppDataSource } from "../src/data-source";
import { clearOutbox, readOutbox } from "../src/mailer/mailer";
import { redisReady } from "../src/lib/redis";
import { hash } from "@node-rs/argon2";
import { User } from "../src/entities/user.entity";
import { Photo } from "../src/entities/photo.entity";
import { Profile } from "../src/entities/profile.entity";
import type { Express } from "express";

const PNG_1PX = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);
const uid = () => `u-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
const jar = (res: { get: (k: string) => unknown }): string => {
  const sc = res.get("set-cookie") as unknown as string[] | string | undefined;
  const first = Array.isArray(sc) ? sc[0] : sc;
  if (!first) throw new Error("pas de cookie");
  return (first as string).split(";")[0]!;
};

let app: Express;

beforeAll(async () => {
  app = await buildApp();
  // les compteurs de rate-limit survivent d'un run à l'autre (clé IP) → purge déterministe
  const r = await redisReady();
  const rlKeys = await r.keys("rl:*");
  if (rlKeys.length > 0) await r.del(...rlKeys);
});
afterAll(async () => {
  await AppDataSource.query("TRUNCATE users, refresh_tokens, profiles, preferences, photos CASCADE");
  await AppDataSource.destroy();
});
beforeEach(() => clearOutbox());

async function registerUser(email: string) {
  const res = await request(app)
    .post("/api/auth/register")
    .send({ email, password: "motdepasse1", birthDate: "1995-06-15" });
  expect(res.status).toBe(201);
  return res.body.data as { id: string; email: string; emailVerified: boolean };
}

async function login(email: string, password = "motdepasse1") {
  return request(app).post("/api/auth/login").send({ email, password });
}
const tokenOf = (res: { body: { data?: { accessToken?: string } } }): string => res.body.data!.accessToken!;

describe("M0 — sante & inscription", () => {
  it("health 200", async () => {
    const res = await request(app).get("/api/health");
    expect(res.status).toBe(200);
  });

  it("register → email normalisé lowercase, non vérifié", async () => {
    const user = await registerUser(`${uid()}@example.fr`);
    expect(user.email).toBe(user.email.toLowerCase());
    expect(user.emailVerified).toBe(false);
  });

  it("register en majuscules → même email en base (dédoublonné)", async () => {
    const email = `${uid()}@example.fr`;
    await registerUser(email);
    const res = await request(app).post("/api/auth/register").send({ email: email.toUpperCase(), password: "motdepasse1", birthDate: "1995-06-15" });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("EMAIL_TAKEN");
  });

  it("corps invalide → 400", async () => {
    const res = await request(app).post("/api/auth/register").send({ email: "pas-un-email", password: "x", birthDate: "nope" });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("VALIDATION_ERROR");
  });

  it("mineur → 422 AGE_BELOW_MINIMUM", async () => {
    const res = await request(app).post("/api/auth/register").send({ email: `${uid()}@example.fr`, password: "motdepasse1", birthDate: "2012-01-01" });
    expect(res.status).toBe(422);
    expect(res.body.code).toBe("AGE_BELOW_MINIMUM");
  });
});

describe("M1 — tokens de session (rotation, famille, plafond)", () => {
  it("login → accessToken + cookie refresh httpOnly", async () => {
    const email = `${uid()}@example.fr`;
    await registerUser(email);
    const res = await login(email);
    expect(res.status).toBe(200);
    expect(res.body.data.accessToken).toBeTruthy();
    expect(res.body.data.user.emailVerified).toBe(false);
    expect(jar(res)).toMatch(/^tipiment_rt=/);
  });

  it("mauvais mdp → 401 générique (anti-énumération)", async () => {
    const email = `${uid()}@example.fr`;
    await registerUser(email);
    const res = await login(email, "MAUVAIS-mot-de-passe");
    expect(res.status).toBe(401);
    expect(res.body.message).toBe("Identifiants invalides.");
  });

  it("refresh : rotation — l'ancien cookie réutilisé révoque la famille entière", async () => {
    const email = `${uid()}@example.fr`;
    await registerUser(email);
    const loginRes = await login(email);
    const cookie1 = jar(loginRes);

    const r1 = await request(app).post("/api/auth/refresh").set("Cookie", cookie1);
    expect(r1.status).toBe(200);
    const cookie2 = jar(r1);
    expect(tokenOf(r1)).not.toBe(tokenOf(loginRes));

    // réutilisation du cookie 1 (déjà consommé) → 401 + famille révoquée
    const reuse = await request(app).post("/api/auth/refresh").set("Cookie", cookie1);
    expect(reuse.status).toBe(401);
    expect(reuse.body.code).toBe("REFRESH_REUSED");

    // cookie 2 (même famille) → 401 aussi
    const asFamily = await request(app).post("/api/auth/refresh").set("Cookie", cookie2);
    expect(asFamily.status).toBe(401);
  });

  it("logout → cookie purgé, refresh refusé ensuite", async () => {
    const email = `${uid()}@example.fr`;
    await registerUser(email);
    const loginRes = await login(email);
    const cookie = jar(loginRes);
    const lo = await request(app).post("/api/auth/logout").set("Cookie", cookie);
    expect(lo.status).toBe(200);
    expect(lo.get("set-cookie")).toBeTruthy();
    const after = await request(app).post("/api/auth/refresh").set("Cookie", jar(lo));
    expect(after.status).toBe(401);
  });

  it("plafond 5 sessions : la 6e connexion révoque la plus ancienne", async () => {
    const email = `${uid()}@example.fr`;
    await registerUser(email);
    const cookies: string[] = [];
    for (let i = 0; i < 6; i++) cookies.push(jar(await login(email)));
    // la plus ancienne est révoquée, la nouvelle doit marcher
    const oldest = await request(app).post("/api/auth/refresh").set("Cookie", cookies[0]!);
    expect(oldest.status).toBe(401);
    const newest = await request(app).post("/api/auth/refresh").set("Cookie", cookies[5]!);
    expect(newest.status).toBe(200);
  });
});

describe("M1 — rate limits", () => {
  it("6 échecs de login → 429 RATE_LIMITED", async () => {
    const email = `${uid()}@example.fr`;
    await registerUser(email);
    for (let i = 0; i < 5; i++) {
      const r = await login(email, "faux-mot-de-passe");
      expect(r.status).toBe(401);
    }
    const sixth = await login(email, "faux-mot-de-passe");
    expect(sixth.status).toBe(429);
    expect(sixth.body.code).toBe("RATE_LIMITED");
  });
});

describe("M1 — vérification email (gate)", () => {
  it("register pousse un mail avec lien signé ; vérifier → emailVerified", async () => {
    const email = `${uid()}@example.fr`;
    await registerUser(email);
    const mails = readOutbox();
    expect(mails.length).toBeGreaterThan(0);
    const link = mails.find((m) => m.text.includes("/verify-email?token="));
    expect(link).toBeTruthy();
    const token = link!.text.match(/token=([\w.-]+)/)![1]!;

    const res = await request(app).post("/api/auth/verify-email").send({ token });
    expect(res.status).toBe(200);
    const loginRes = await login(email);
    expect(loginRes.body.data.user.emailVerified).toBe(true);
  });

  it("profil : écriture refusée 403 si email non vérifié ; OK après vérification", async () => {
    const email = `${uid()}@example.fr`;
    const user = await registerUser(email);
    const loginRes = await login(email);
    const token = tokenOf(loginRes);
    const auth = { Authorization: `Bearer ${token}` };

    const body = { displayName: "Alice", intention: "relation_serieuse", gender: "femme", seeking: "tous", commune: "Paris", bio: null };
    const refused = await request(app).put("/api/me/profile").set(auth).send(body);
    expect(refused.status).toBe(403);
    expect(refused.body.code).toBe("EMAIL_NOT_VERIFIED");

    const link = readOutbox().find((m) => m.text.includes("/verify-email?token="))!;
    await request(app).post("/api/auth/verify-email").send({ token: link.text.match(/token=([\w.-]+)/)![1] });
    void user;

    // re-login : access token neuf (claim email_verified à jour)
    const login2 = await login(email);
    const auth2 = { Authorization: `Bearer ${tokenOf(login2)}` };
    const ok = await request(app).put("/api/me/profile").set(auth2).send(body);
    expect(ok.status).toBe(200);
    const prefs = await request(app).put("/api/me/preferences").set(auth2).send({ ageMin: 18, ageMax: 35, distanceKm: 50, intention: null });
    expect(prefs.status).toBe(200);
    const prefsBad = await request(app).put("/api/me/preferences").set(auth2).send({ ageMin: 16, ageMax: 30, distanceKm: 50 });
    expect(prefsBad.status).toBe(400);
    const bundle = await request(app).get("/api/me/profile").set(auth2);
    expect(bundle.body.data.profile.displayName).toBe("Alice");
    expect(bundle.body.data.completed).toBe(false); // pas encore de photo approuvée
  });
});

describe("M1 — photos", () => {
  it("upload 1x1 PNG → 201 approved (auto-approve dev), puis GET renvoie la photo", async () => {
    const email = `${uid()}@example.fr`;
    await registerUser(email);
    const link = readOutbox().find((m) => m.text.includes("/verify-email?token="))!;
    await request(app).post("/api/auth/verify-email").send({ token: link.text.match(/token=([\w.-]+)/)![1] });
    const loginRes = await login(email);
    const auth = { Authorization: `Bearer ${tokenOf(loginRes)}`, Cookie: "" };
    await request(app).put("/api/me/profile").set(auth).send({ displayName: "Bob", intention: "a_voir", gender: "homme", seeking: "femme", commune: "Lyon" });
    const up = await request(app).post("/api/me/photos").set(auth).attach("photo", PNG_1PX, { filename: "a.png", contentType: "image/png" });
    expect(up.status).toBe(201);
    expect(up.body.data.url).toMatch(/^\/uploads\//);
    const bundle = await request(app).get("/api/me/profile").set(auth);
    expect(bundle.body.data.photos).toHaveLength(1);
    expect(bundle.body.data.completed).toBe(true);
  });

  it("contenu non-image → 415 UNSUPPORTED_MEDIA", async () => {
    const email = `${uid()}@example.fr`;
    await registerUser(email);
    const link = readOutbox().find((m) => m.text.includes("/verify-email?token="))!;
    await request(app).post("/api/auth/verify-email").send({ token: link.text.match(/token=([\w.-]+)/)![1] });
    const loginRes = await login(email);
    const auth = { Authorization: `Bearer ${tokenOf(loginRes)}`, Cookie: "" };
    await request(app).put("/api/me/profile").set(auth).send({ displayName: "Cara", intention: "a_voir", gender: "femme", seeking: "tous", commune: "Nantes" });
    const up = await request(app).post("/api/me/photos").set(auth).attach("photo", Buffer.from("ceci n'est pas une image"), { filename: "x.txt" });
    expect(up.status).toBe(415);
  });

  it("6 photos max → 409 MAX_PHOTOS à la 7e", async () => {
    const email = `${uid()}@example.fr`;
    await registerUser(email);
    const link = readOutbox().find((m) => m.text.includes("/verify-email?token="))!;
    await request(app).post("/api/auth/verify-email").send({ token: link.text.match(/token=([\w.-]+)/)![1] });
    const loginRes = await login(email);
    const auth = { Authorization: `Bearer ${tokenOf(loginRes)}`, Cookie: "" };
    await request(app).put("/api/me/profile").set(auth).send({ displayName: "Dee", intention: "sortir_decouvrir", gender: "femme", seeking: "tous", commune: "Bordeaux" });
    for (let i = 0; i < 6; i++) {
      const up = await request(app).post("/api/me/photos").set(auth).attach("photo", PNG_1PX, { filename: `a${i}.png` });
      expect(up.status).toBe(201);
    }
    const seven = await request(app).post("/api/me/photos").set(auth).attach("photo", PNG_1PX, { filename: "a7.png" });
    expect(seven.status).toBe(409);
    expect(seven.body.code).toBe("MAX_PHOTOS");
  });
});

describe("M1 — mot de passe oublié / reset", () => {
  it("forgot : 200 générique même avec un email inconnu", async () => {
    const res = await request(app).post("/api/auth/forgot-password").send({ email: `inconnu-${uid()}@example.fr` });
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe("ok");
  });

  it("reset via le mail → ancien mdp refusé, nouveau OK, sessions révoquées", async () => {
    const email = `${uid()}@example.fr`;
    await registerUser(email);
    const loginRes = await login(email);
    const preResetCookie = jar(loginRes);

    await request(app).post("/api/auth/forgot-password").send({ email });
    const link = readOutbox().find((m) => m.text.includes("/reset-password?token="))!;
    const token = link.text.match(/token=([\w.-]+)/)![1]!;
    const reset = await request(app).post("/api/auth/reset-password").send({ token, password: "nouveau-mot-de-passe-99" });
    expect(reset.status).toBe(200);

    const oldPw = await login(email, "motdepasse1");
    expect(oldPw.status).toBe(401);
    const newPw = await login(email, "nouveau-mot-de-passe-99");
    expect(newPw.status).toBe(200);
    const revoked = await request(app).post("/api/auth/refresh").set("Cookie", preResetCookie);
    expect(revoked.status).toBe(401);
  });
});

describe("M1 — admin photos", () => {
  it("user simple → 403 ; admin approuve une photo pending", async () => {
    const email = `${uid()}@example.fr`;
    await registerUser(email);
    const loginRes = await login(email);
    const userAuth = { Authorization: `Bearer ${tokenOf(loginRes)}` };
    const forbidden = await request(app).get("/api/admin/photos?status=pending").set(userAuth);
    expect(forbidden.status).toBe(403);

    // admin créé directement en base
    const adminRepo = AppDataSource.getRepository(User);
    const adminEmail = `admin-${uid()}@example.fr`;
    const admin = adminRepo.create({
      email: adminEmail,
      passwordHash: await hash("motdepasse-admin", { memoryCost: 19456, timeCost: 2, parallelism: 1 }),
      role: "admin",
      emailVerified: true,
    });
    await adminRepo.save(admin);
    const adminLogin = await login(adminEmail, "motdepasse-admin");
    expect(adminLogin.status).toBe(200);
    const adminAuth = { Authorization: `Bearer ${tokenOf(adminLogin)}` };

    // photo pending injectée (profil réel pour respecter la FK)
    const target = await registerUser(`${uid()}@example.fr`);
    const prof = await AppDataSource.getRepository(Profile).save(
      AppDataSource.getRepository(Profile).create({
        userId: target.id,
        displayName: "Eve",
        intention: "a_voir",
        gender: "femme",
        seeking: "tous",
      }),
    );
    const photoRepo = AppDataSource.getRepository(Photo);
    const pending = photoRepo.create({
      userId: target.id,
      profileId: prof.id,
      pathOrig: "test/o.webp", pathMain: "test/m.webp", pathThumb: "test/t.webp",
      position: 1, status: "pending",
    });
    await photoRepo.save(pending);
    const approved = await request(app).post(`/api/admin/photos/${pending.id}/approve`).set(adminAuth);
    expect(approved.status).toBe(200);
    expect(approved.body.data.status).toBe("approved");
    const list = await request(app).get("/api/admin/photos?status=approved").set(adminAuth);
    expect(list.body.data.some((p: { id: string }) => p.id === pending.id)).toBe(true);
  });
});

describe("M1 — suppression de compte", () => {
  it("DELETE /api/me → 204 ; login impossible ; email anonymisé en base", async () => {
    const email = `${uid()}@example.fr`;
    const user = await registerUser(email);
    const loginRes = await login(email);
    const del = await request(app).delete("/api/me").set({ Authorization: `Bearer ${tokenOf(loginRes)}` });
    expect(del.status).toBe(204);
    const after = await login(email);
    expect(after.status).toBe(401);
    const row = await AppDataSource.getRepository(User).findOne({ where: { id: user.id } });
    expect(row!.email).toBe(`deleted:${user.id}@tipiment.invalid`);
    expect(row!.emailVerified).toBe(false);
  });
});
