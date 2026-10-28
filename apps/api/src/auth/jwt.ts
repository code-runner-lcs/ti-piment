import { SignJWT, jwtVerify } from "jose";
import type { SessionUser } from "@tipiment/shared";
import { config } from "../config";
import { AppError } from "../http/app-error";

const secret = () => new TextEncoder().encode(config.jwt.secret);
const ISSUER = "tipiment-api";
const AUDIENCE = "tipiment-web";

export async function signAccessToken(user: SessionUser): Promise<string> {
  return new SignJWT({ email: user.email, role: user.role })
    .setProtectedHeader({ alg: "HS512" }) // CDC §10 : HS512
    .setSubject(user.id)
    .setIssuedAt()
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setJti(crypto.randomUUID())
    .setExpirationTime(`${config.jwt.expiresInSeconds}s`)
    .sign(secret());
}

export async function verifyAccessToken(token: string): Promise<SessionUser> {
  const { payload } = await jwtVerify(token, secret(), {
    algorithms: ["HS512"],
    issuer: ISSUER,
    audience: AUDIENCE,
  });
  const id = payload.sub;
  const email = payload.email;
  if (!id || typeof email !== "string") {
    throw AppError.unauthorized("Token invalide");
  }
  const role = payload.role === "admin" ? "admin" : "user";
  return { id, email, role };
}
