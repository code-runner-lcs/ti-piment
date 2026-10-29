import { z } from "zod";

export const ACTIONS = ["pass", "like", "superlike"] as const;

export const SwipeSchema = z.object({
  targetProfileId: z.string().uuid(),
  action: z.enum(ACTIONS),
});
export type SwipeInput = z.infer<typeof SwipeSchema>;

export const CardDtoSchema = z.object({
  profileId: z.string().uuid(),
  userId: z.string().uuid(),
  displayName: z.string(),
  age: z.number().int().min(18),
  commune: z.string(),
  intention: z.string(),
  bio: z.string().nullable(),
  mainUrl: z.string(),
  thumbUrl: z.string(),
  superlikedMe: z.boolean(),
  distanceKm: z.number().int().min(0).nullable(),
});
export type CardDto = z.infer<typeof CardDtoSchema>;

export const QuotasDtoSchema = z.object({
  likes: z.number().int(),
  maxLikes: z.number().int(),
  superlikes: z.number().int(),
  maxSuperlikes: z.number().int(),
  resetsAt: z.string(),
});
export type QuotasDto = z.infer<typeof QuotasDtoSchema>;

export const CityDtoSchema = z.object({
  insee: z.string(),
  name: z.string(),
  label: z.string(),
});
export type CityDto = z.infer<typeof CityDtoSchema>;

export const CitiesSearchSchema = z.object({
  q: z.string().trim().min(2).max(64),
});

export const DeckDtoSchema = z.object({
  cards: z.array(CardDtoSchema),
  reason: z.enum(["ok", "exhausted"]),
  quotas: QuotasDtoSchema,
});
export type DeckDto = z.infer<typeof DeckDtoSchema>;

export const MatchDtoSchema = z.object({
  id: z.string().uuid(),
  otherProfile: z.object({
    displayName: z.string(),
    thumbUrl: z.string().nullable(),
    userId: z.string().uuid(),
    profileId: z.string().uuid(),
  }),
  created_at: z.string(),
});

export const REPORT_REASONS = ["faux_profil", "contenu_inapproprie", "harcelement", "escroquerie", "mineur", "autre"] as const;

export const ReportSchema = z.object({
  targetProfileId: z.string().uuid(),
  reason: z.enum(REPORT_REASONS),
  detail: z.string().max(500).optional().nullable(),
});
export type ReportInput = z.infer<typeof ReportSchema>;

export const BlockSchema = z
  .object({ profileId: z.string().uuid().optional(), userId: z.string().uuid().optional() })
  .refine((v) => Boolean(v.profileId ?? v.userId), "Cible manquante");

export const SendMessageSchema = z.object({
  clientUuid: z.string().uuid(),
  body: z.string().trim().min(1).max(1000),
});
export type SendMessageInput = z.infer<typeof SendMessageSchema>;

export const MessageDtoSchema = z.object({
  id: z.string().uuid(),
  matchId: z.string().uuid(),
  senderId: z.string().uuid(),
  body: z.string(),
  createdAt: z.string(),
});
export type MessageDto = z.infer<typeof MessageDtoSchema>;

export const MessageListDtoSchema = z.object({
  messages: z.array(MessageDtoSchema),
  nextCursor: z.string().nullable(),
});
export type MatchDto = z.infer<typeof MatchDtoSchema>;

export const SwipeResultDtoSchema = z.object({
  matched: z.boolean(),
  match: MatchDtoSchema.nullable(),
  quotas: QuotasDtoSchema,
});
export type SwipeResultDto = z.infer<typeof SwipeResultDtoSchema>;
