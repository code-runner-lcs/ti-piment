import { z } from "zod";

export const RegisterSchema = z.object({
  email: z.string().email().max(254),
  password: z.string().min(8).max(200),
  birthDate: z.string().date(),
});
export type RegisterInput = z.infer<typeof RegisterSchema>;

export const LoginSchema = z.object({
  email: z.string().email().max(254),
  password: z.string().min(1).max(200),
});
export type LoginInput = z.infer<typeof LoginSchema>;

export const SessionUserSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  role: z.enum(["user", "admin"]),
});
export type SessionUser = z.infer<typeof SessionUserSchema>;

/** Réponse de POST /auth/login : access token + profil de session */
export const AccessTokenSchema = z.object({
  accessToken: z.string().min(1),
  user: SessionUserSchema,
});
export type AccessTokenPayload = z.infer<typeof AccessTokenSchema>;
