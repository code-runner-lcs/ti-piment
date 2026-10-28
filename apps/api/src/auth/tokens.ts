import { SignJWT, jwtVerify } from "jose";
import { config } from "../config";
import { AppError } from "../http/app-error";

export type EmailTokenType = "email_verify" | "password_reset";
const EMAIL_AUD = "tipiment-email";

export function signEmailToken(
  userId: string,
  email: string,
  type: EmailTokenType,
  expiration: "24h" | "30m",
): Promise<string> {
  return new SignJWT({ type, email })
    .setProtectedHeader({ alg: "HS512" })
    .setSubject(userId)
    .setAudience(EMAIL_AUD)
    .setIssuedAt()
    .setExpirationTime(expiration)
    .sign(new TextEncoder().encode(config.jwt.secret));
}

export async function verifyEmailToken(
  token: string,
  expected: EmailTokenType,
): Promise<{ userId: string; email: string }> {
  try {
    const { payload } = await jwtVerify(token, new TextEncoder().encode(config.jwt.secret), {
      algorithms: ["HS512"],
      audience: EMAIL_AUD,
    });
    if (payload.type !== expected || typeof payload.email !== "string" || !payload.sub) {
      throw AppError.badRequest("Jeton invalide", "INVALID_TOKEN");
    }
    return { userId: payload.sub, email: payload.email };
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw AppError.badRequest("Jeton expiré ou invalide", "INVALID_TOKEN");
  }
}
