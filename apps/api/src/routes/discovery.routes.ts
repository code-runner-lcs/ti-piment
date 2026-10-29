import { Router } from "express";
import type { MatchDto } from "@tipiment/shared";
import { SwipeSchema } from "@tipiment/shared";
import { AppError } from "../http/app-error";
import { asyncRoute } from "../http/async-route";
import { clientIp, rateLimit } from "../http/limiter";
import { requireAuth, requireVerified } from "../auth/middleware";
import { AppDataSource } from "../data-source";
import { Photo } from "../entities/photo.entity";
import { Profile } from "../entities/profile.entity";
import { Swipe } from "../entities/swipe.entity";
import { User } from "../entities/user.entity";
import { getDeck } from "../services/deck.service";
import { consumeLike, consumeSuperlike, getQuotas } from "../services/quota.service";
import { cardFor, existsRecentLike, getOrCreateMatch, listMatches } from "../services/match.service";
import { config } from "../config";

export const discoveryRouter = Router();

discoveryRouter.use(requireAuth);

function ageFrom(birthDate: string): number {
  const b = new Date(`${birthDate}T00:00:00Z`);
  let age = new Date().getUTCFullYear() - b.getUTCFullYear();
  const m = new Date().getUTCMonth() - b.getUTCMonth();
  if (m < 0 || (m === 0 && new Date().getUTCDate() < b.getUTCDate())) age--;
  return age;
}

interface MyCtx {
  profile: { id: string; gender: string; seeking: string; intention: string };
  myAge: number;
  ageMin: number;
  ageMax: number;
  distanceKm: number | null;
  myInsee: string | null;
  intentionPref: string | null;
}

async function loadMyContext(userId: string): Promise<MyCtx> {
  const user = await AppDataSource.getRepository(User).findOne({ where: { id: userId } });
  if (!user?.birthDate) {
    throw AppError.badRequest("Renseigne ta date de naissance (profil) pour la découverte.", "PROFILE_REQUIRED");
  }
  const profile = await AppDataSource.getRepository(Profile).findOne({ where: { userId } });
  if (!profile) throw AppError.badRequest("Crée d'abord ton profil.", "PROFILE_REQUIRED");
  const rows = (await AppDataSource.query(
    `SELECT COALESCE(age_min,18) AS age_min, COALESCE(age_max,99) AS age_max, distance_km, intention
     FROM preferences WHERE profile_id = $1`,
    [profile.id],
  )) as unknown as Array<{ age_min: number; age_max: number; distance_km: number; intention: string | null }>;
  const prefs = rows[0];
  return {
    profile: { id: profile.id, gender: profile.gender, seeking: profile.seeking, intention: profile.intention },
    myAge: ageFrom(user.birthDate),
    ageMin: prefs ? Number(prefs.age_min) : 18,
    ageMax: prefs ? Number(prefs.age_max) : 99,
    distanceKm: prefs ? Number(prefs.distance_km) : null,
    myInsee: profile.communeInsee ?? null,
    intentionPref: prefs?.intention ?? null,
  };
}

async function isPublic(profile: Profile): Promise<boolean> {
  if (profile.completedAt === null) return false;
  return AppDataSource.getRepository(Photo).exists({ where: { profileId: profile.id, status: "approved" } });
}

privateDeck();

function privateDeck(): void {
  // GET /api/deck — pré-calculé serveur, 10–20 cartes prêtes à afficher
  discoveryRouter.get(
    "/deck",
    requireVerified(),
    rateLimit({ key: (r) => `deck${clientIp(r)}`, max: 60, windowSec: 60 }),
    asyncRoute(async (req, res) => {
      const user = req.user!;
      const ctx = await loadMyContext(user.id);
      const salt = new Date().toISOString().slice(0, 10); // sel = date du jour (déterministe, CDC §8)
      const cards = await getDeck({
        myUserId: user.id,
        myProfileId: ctx.profile.id,
        myGender: ctx.profile.gender,
        mySeeking: ctx.profile.seeking,
        myAge: ctx.myAge,
        myAgeMin: ctx.ageMin,
        myAgeMax: ctx.ageMax,
        myInsee: ctx.myInsee,
        radiusKm: ctx.distanceKm,
        myIntentionPref: ctx.intentionPref,
        salt,
      });
      const quotas = await getQuotas(user.id);
      res.json({
        data: {
          cards,
          reason: cards.length === 0 ? "exhausted" : "ok",
          quotas: {
            likes: quotas.likes,
            maxLikes: config.quotas.maxLikes,
            superlikes: quotas.superlikes,
            maxSuperlikes: config.quotas.maxSuperlikes,
            resetsAt: quotas.resetsAt.toISOString(),
          },
        },
      });
    }),
  );

  discoveryRouter.post(
    "/swipe",
    requireVerified(),
    rateLimit({ key: (r) => `swp${clientIp(r)}`, max: 120, windowSec: 60 }),
    asyncRoute(async (req, res) => {
      const user = req.user!;
      const parsed = SwipeSchema.safeParse(req.body);
      if (!parsed.success) throw AppError.badRequest("Swipe invalide.");
      const { targetProfileId, action } = parsed.data;

      const me = await loadMyContext(user.id);

      const target = await AppDataSource.getRepository(Profile).findOne({
        where: { id: targetProfileId },
      });
      if (!target || target.userId === user.id || !(await isPublic(target))) {
        throw new AppError(404, "NOT_FOUND", "Profil introuvable.");
      }
      const targetUser = await AppDataSource.getRepository(User).findOne({ where: { id: target.userId } });
      if (!targetUser?.emailVerified || !targetUser.birthDate) {
        throw new AppError(404, "NOT_FOUND", "Profil introuvable.");
      }

      // quotas : passes illimitées, like 25/j, super-like 1/j (CDC §F3)
      if (action === "like") await consumeLike(user.id);
      if (action === "superlike") await consumeSuperlike(user.id);

      try {
        await AppDataSource.getRepository(Swipe).save(
          AppDataSource.getRepository(Swipe).create({
            swiperProfileId: me.profile.id,
            targetProfileId: target.id,
            action,
            swiperUserId: user.id,
            targetUserId: targetUser.id,
          }),
        );
      } catch (err) {
        if ((err as { code?: string }).code === "23505") {
          // le swipe existant a déjà consommé le quota à l'époque — pas de remboursement (409 simple)
          throw new AppError(409, "ALREADY_SWIPED", "Ce profil est déjà dans ta pile récente.");
        }
        throw err;
      }

      // réciprocité → match idempotent
      let matchDto: MatchDto | null = null;
      if (action !== "pass") {
        const theyLikedMe = await existsRecentLike(targetUser.id, me.profile.id);
        if (theyLikedMe) {
          const match = await getOrCreateMatch(user.id, targetUser.id);
          if (match) {
            const card = await cardFor(targetUser.id);
            matchDto = {
              id: match.id,
              otherProfile: {
                displayName: card?.displayName ?? target.displayName,
                userId: targetUser.id,
                profileId: target.id,
                thumbUrl: card?.thumbUrl ?? null,
              },
              created_at: match.createdAt.toISOString(),
            };
          }
        }
      }

      const quotas = await getQuotas(user.id);
      res.json({
        data: {
          matched: matchDto !== null,
          match: matchDto,
          quotas: {
            likes: quotas.likes,
            maxLikes: config.quotas.maxLikes,
            superlikes: quotas.superlikes,
            maxSuperlikes: config.quotas.maxSuperlikes,
            resetsAt: quotas.resetsAt.toISOString(),
          },
        },
      });
    }),
  );

  discoveryRouter.get("/quotas", asyncRoute(async (req, res) => {
    const user = req.user!;
    const quotas = await getQuotas(user.id);
    res.json({
      data: {
        likes: quotas.likes,
        maxLikes: config.quotas.maxLikes,
        superlikes: quotas.superlikes,
        maxSuperlikes: config.quotas.maxSuperlikes,
        resetsAt: quotas.resetsAt.toISOString(),
      },
    });
  }));

  discoveryRouter.get("/matches", requireVerified(), asyncRoute(async (req, res) => {
    const user = req.user!;
    res.json({ data: await listMatches(user.id) });
  }));
}
