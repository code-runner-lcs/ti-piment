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
  }),
  created_at: z.string(),
});
export type MatchDto = z.infer<typeof MatchDtoSchema>;

export const SwipeResultDtoSchema = z.object({
  matched: z.boolean(),
  match: MatchDtoSchema.nullable(),
  quotas: QuotasDtoSchema,
});
export type SwipeResultDto = z.infer<typeof SwipeResultDtoSchema>;
