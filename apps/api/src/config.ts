const int = (v: string | undefined, d: number) => {
  const n = v ? Number(v) : NaN;
  return Number.isFinite(n) ? n : d;
};

const isProd = process.env.NODE_ENV === "production";

export const config = {
  port: int(process.env.PORT, 3000),
  isProd,
  webUrl: process.env.WEB_URL ?? "http://localhost:5273",
  pg: {
    host: process.env.PG_HOST ?? "localhost",
    port: int(process.env.PG_PORT, 5477),
    user: process.env.PG_USER ?? "tipiment",
    password: process.env.PG_PASSWORD ?? "tipiment",
    database: process.env.PG_DB ?? "tipiment",
  },
  redis: {
    url: process.env.REDIS_URL ?? "redis://localhost:6380",
    // fail-closed : sans Redis, les routes d'auth répondent 503 (CDC §10)
  },
  jwt: {
    secret: process.env.JWT_SECRET ?? "",
    expiresInSeconds: int(process.env.JWT_EXPIRES_SECONDS, 900), // access 15 min — CDC §4.2
  },
  refresh: {
    cookieName: process.env.REFRESH_COOKIE ?? "tipiment_rt",
    ttlDays: int(process.env.REFRESH_TTL_DAYS, 30), // CDC §4.2 : 30 j
    maxSessions: int(process.env.MAX_SESSIONS, 5),
  },
  quotas: {
    maxLikes: int(process.env.QUOTA_LIKES, 25), // CDC §F3 : 25 likes/jour
    maxSuperlikes: int(process.env.QUOTA_SUPERLIKES, 1), // CDC §F3 : 1 super-like/jour
    timezone: process.env.QUOTA_TZ ?? "Europe/Paris", // reset 00:00 locale (§13-8)
  },
  photos: {
    uploadsDir: process.env.UPLOADS_DIR ?? "uploads", // résolu sous apps/api en dev
    maxBytes: int(process.env.PHOTO_MAX_BYTES, 8 * 1024 * 1024), // CDC §6 : ≤ 8 Mo
    maxPerUser: int(process.env.PHOTO_MAX, 6), // CDC §6 : 1–6
    // Dev : auto-approuve (back-office M1 en attente). Prod : laisser false.
    autoApprove: (process.env.PHOTOS_AUTO_APPROVE ?? (isProd ? "false" : "true")) === "true",
  },
};

config.photos.uploadsDir = config.photos.uploadsDir.includes(":")
  ? config.photos.uploadsDir
  : config.photos.uploadsDir;

if (!config.jwt.secret) {
  if (isProd) throw new Error("JWT_SECRET manquant en production");
  config.jwt.secret = "tipiment-dev-secret-change-me";
  console.warn("[config] JWT_SECRET absent — secret de dev utilisé (interdit en prod)");
}
