import { Router, type Request } from "express";
import { hash } from "@node-rs/argon2";
import {
  ForgotPasswordSchema,
  LoginSchema,
  RegisterSchema,
  ResendVerificationSchema,
  ResetPasswordSchema,
  VerifyEmailSchema,
} from "@tipiment/shared";
import { AppError } from "../http/app-error";
import { asyncRoute } from "../http/async-route";
import { clientIp, rateLimit, refundRateLimit } from "../http/limiter";
import { AppDataSource } from "../data-source";
import { User } from "../entities/user.entity";
import { login, register } from "../services/auth.service";
import { signAccessToken } from "../auth/jwt";
import { signEmailToken, verifyEmailToken } from "../auth/tokens";
import { sendResetEmail, sendVerificationEmail } from "../mailer/mailer";
import { clearRefreshCookie, refreshCookieFrom, setRefreshCookie } from "../auth/cookies";
import { logout as logoutRefresh, revokeAll, rotate } from "../auth/refresh";

export const authRouter = Router();

const emailKey = (req: Request): string => {
  const e = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
  return `ip${clientIp(req)}:em${e}`;
};

// Register : 100/h par IP (anti farm — le CDC ne fige que le login)
authRouter.post(
  "/register",
  rateLimit({ key: (r) => `reg${clientIp(r)}`, max: 100, windowSec: 3600 }),
  asyncRoute(async (req, res) => {
    const parsed = RegisterSchema.safeParse(req.body);
    if (!parsed.success) {
      throw AppError.badRequest(parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "));
    }
    const user = await register(parsed.data);
    const token = await signEmailToken(user.id, user.email, "email_verify", "24h");
    await sendVerificationEmail(user.id, user.email, token);
    res.status(201).json({ data: user });
  }),
);

// Login : 5 ÉCHECS / 15 min par IP+email (CDC §4.3) — les succès sortent du compteur
authRouter.post("/login", rateLimit({ key: emailKey, max: 5, windowSec: 900, refundOnSuccess: true }), asyncRoute(async (req, res) => {
  const parsed = LoginSchema.safeParse(req.body);
  if (!parsed.success) throw AppError.badRequest("Email ou mot de passe invalide.");
  const { accessToken, user, refreshPlain } = await login(parsed.data);
  await refundRateLimit(res); // une connexion RÉUSSIE ne compte pas (limite = échecs)
  setRefreshCookie(res, refreshPlain);
  res.json({ data: { accessToken, user } });
}));

// Refresh : rotation via cookie httpOnly — le nouveau cookie est posé ici
authRouter.post("/refresh", rateLimit({ key: (r) => `refr${clientIp(r)}`, max: 60, windowSec: 60 }), asyncRoute(async (req, res) => {
  const plain = refreshCookieFrom(req);
  if (!plain) throw AppError.unauthorized("Session absente");
  const { user, nextPlain } = await rotate(plain, req.headers["user-agent"]);
  setRefreshCookie(res, nextPlain);
  res.json({ data: { accessToken: await signAccessToken(user), user } });
}));

// Logout : révoque la ligne courante
authRouter.post("/logout", asyncRoute(async (req, res) => {
  const plain = refreshCookieFrom(req);
  if (plain) await logoutRefresh(plain);
  clearRefreshCookie(res);
  res.json({ data: { status: "ok" } });
}));

authRouter.post(
  "/verify-email",
  rateLimit({ key: (r) => `verif${clientIp(r)}`, max: 30, windowSec: 600 }),
  asyncRoute(async (req, res) => {
    const parsed = VerifyEmailSchema.safeParse(req.body);
    if (!parsed.success) throw AppError.badRequest("Jeton manquant.", "INVALID_TOKEN");
    const { userId } = await verifyEmailToken(parsed.data.token, "email_verify");
    const repo = AppDataSource.getRepository(User);
    const user = await repo.findOne({ where: { id: userId } });
    if (!user) throw AppError.badRequest("Compte introuvable.", "INVALID_TOKEN");
    if (!user.emailVerified) {
      user.emailVerified = true;
      await repo.save(user);
    }
    res.json({ data: { status: "verified", email: user.email } });
  }),
);

// Renvoi : 5 / 10 min par IP+email, réponse générique (anti-énumération)
authRouter.post("/resend-verification", rateLimit({ key: emailKey, max: 5, windowSec: 600 }), asyncRoute(async (req, res) => {
  const parsed = ResendVerificationSchema.safeParse(req.body);
  if (!parsed.success) throw AppError.badRequest("Email invalide.");
  const email = parsed.data.email.trim().toLowerCase();
  const user = await AppDataSource.getRepository(User).findOne({ where: { email } });
  if (user && !user.emailVerified) {
    const token = await signEmailToken(user.id, user.email, "email_verify", "24h");
    await sendVerificationEmail(user.id, user.email, token);
  }
  res.json({ data: { status: "sent" } });
}));

// Mot de passe oublié : TOUJOURS 200 générique (anti-énumération, CDC §4.3)
authRouter.post("/forgot-password", rateLimit({ key: emailKey, max: 5, windowSec: 3600 }), asyncRoute(async (req, res) => {
  const parsed = ForgotPasswordSchema.safeParse(req.body);
  if (!parsed.success) throw AppError.badRequest("Email invalide.");
  const email = parsed.data.email.trim().toLowerCase();
  const user = await AppDataSource.getRepository(User).findOne({ where: { email } });
  if (user) {
    const token = await signEmailToken(user.id, user.email, "password_reset", "30m");
    await sendResetEmail(user.id, user.email, token);
  }
  res.json({ data: { status: "ok" } });
}));

// Reset : révoque TOUTES les sessions de l'utilisateur (CDC §4.3)
authRouter.post(
  "/reset-password",
  rateLimit({ key: (r) => `reseta${clientIp(r)}`, max: 20, windowSec: 3600 }),
  asyncRoute(async (req, res) => {
    const parsed = ResetPasswordSchema.safeParse(req.body);
    if (!parsed.success) throw AppError.badRequest("Mot de passe invalide (8 caractères minimum).");
    const { userId, email } = await verifyEmailToken(parsed.data.token, "password_reset");
    const repo = AppDataSource.getRepository(User);
    const user = await repo.findOne({ where: { id: userId, email } });
    if (!user) throw AppError.badRequest("Jeton invalide.", "INVALID_TOKEN");
    user.passwordHash = await hash(parsed.data.password, { memoryCost: 19456, timeCost: 2, parallelism: 1 });
    await repo.save(user);
    await revokeAll(user.id);
    clearRefreshCookie(res);
    res.json({ data: { status: "ok" } });
  }),
);
