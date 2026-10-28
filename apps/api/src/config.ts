const int = (v: string | undefined, d: number) => {
  const n = v ? Number(v) : NaN;
  return Number.isFinite(n) ? n : d;
};

export const config = {
  port: int(process.env.PORT, 3000),
  pg: {
    host: process.env.PG_HOST ?? "localhost",
    port: int(process.env.PG_PORT, 5477),
    user: process.env.PG_USER ?? "tipiment",
    password: process.env.PG_PASSWORD ?? "tipiment",
    database: process.env.PG_DB ?? "tipiment",
  },
  jwt: {
    secret: process.env.JWT_SECRET ?? "",
    expiresInSeconds: int(process.env.JWT_EXPIRES_SECONDS, 900), // 15 min — CDC §4.2
  },
};

if (!config.jwt.secret) {
  if (process.env.NODE_ENV === "production") {
    throw new Error("JWT_SECRET manquant en production");
  }
  config.jwt.secret = "tipiment-dev-secret-change-me";
  console.warn("[config] JWT_SECRET absent — secret de dev utilisé (interdit en prod)");
}
