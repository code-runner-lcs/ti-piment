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
  emailVerified: z.boolean(),
});
export type SessionUser = z.infer<typeof SessionUserSchema>;

/** Réponse de POST /auth/login et /auth/refresh */
export const AccessTokenPayloadSchema = z.object({
  accessToken: z.string().min(1),
  user: SessionUserSchema,
});
export type AccessTokenPayload = z.infer<typeof AccessTokenPayloadSchema>;

export const VerifyEmailSchema = z.object({ token: z.string().min(10).max(2048) });
export const ResendVerificationSchema = z.object({ email: z.string().email() });
export const ForgotPasswordSchema = z.object({ email: z.string().email() });
export const ResetPasswordSchema = z.object({
  token: z.string().min(10).max(2048),
  password: z.string().min(8).max(200),
});

export const INTENTIONS = ["relation_serieuse", "sortir_decouvrir", "a_voir"] as const;
export const GENDERS = ["femme", "homme", "non_binaire", "autre"] as const;
export const SEEKINGS = ["femme", "homme", "tous"] as const;

/** Regex anti-liens / anti-handle réseaux sociaux (CDC §F1) */
export function containsForbiddenLink(s: string): boolean {
  return /(https?:\/\/|www\.)|\b(instagram|snap|snapchat|telegram|whatsapp|tiktok|facebook|messenger|discord)\s*[:@-]/i.test(s);
}

export const ProfileSchema = z.object({
  displayName: z.string().trim().min(2).max(20),
  intention: z.enum(INTENTIONS),
  gender: z.enum(GENDERS),
  seeking: z.enum(SEEKINGS),
  bio: z
    .string()
    .max(500)
    .optional()
    .nullable()
    .refine((v) => !v || !containsForbiddenLink(v), "Pas de lien ni de réseaux sociaux dans la bio."),
  commune: z.string().trim().min(2).max(64),
});
export type ProfileInput = z.infer<typeof ProfileSchema>;

export const PreferencesSchema = z
  .object({
    ageMin: z.number().int().min(18).max(99),
    ageMax: z.number().int().min(18).max(99),
    distanceKm: z.number().int().min(1).max(160),
    intention: z.enum(INTENTIONS).nullable().optional(),
  })
  .refine((v) => v.ageMax >= v.ageMin, { message: "ageMax doit être >= ageMin" });
export type PreferencesInput = z.infer<typeof PreferencesSchema>;

export const PhotoDtoSchema = z.object({
  id: z.string().uuid(),
  url: z.string(),
  thumbUrl: z.string(),
  status: z.enum(["pending", "approved", "rejected"]),
  position: z.number().int(),
});
export type PhotoDto = z.infer<typeof PhotoDtoSchema>;

export const ProfileDtoSchema = z.object({
  displayName: z.string(),
  intention: z.string(),
  gender: z.string(),
  seeking: z.string(),
  bio: z.string().nullable(),
  commune: z.string().nullable(),
  emailVerified: z.boolean(),
  completed: z.boolean(),
});

export const PreferencesDtoSchema = z.object({
  ageMin: z.number().int(),
  ageMax: z.number().int(),
  distanceKm: z.number().int(),
  intention: z.string().nullable(),
});
export type PreferencesDto = z.infer<typeof PreferencesDtoSchema>;

export const ProfileBundleSchema = z.object({
  completed: z.boolean(),
  profile: z
    .object({
      displayName: z.string(),
      intention: z.string(),
      gender: z.string(),
      seeking: z.string(),
      bio: z.string().nullable(),
      commune: z.string().nullable(),
      emailVerified: z.boolean(),
      completed: z.boolean(),
    })
    .nullable(),
  preferences: PreferencesDtoSchema.nullable(),
  photos: z.array(PhotoDtoSchema),
});
export type ProfileBundle = z.infer<typeof ProfileBundleSchema>;
