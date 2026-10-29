import type { CardDto, MatchDto } from "@tipiment/shared";
import { AppDataSource } from "../data-source";
import { Match } from "../entities/match.entity";
import { Message } from "../entities/message.entity";
import { Block } from "../entities/block.entity";
import { Profile } from "../entities/profile.entity";
import { Photo } from "../entities/photo.entity";
import { User } from "../entities/user.entity";
import { Swipe } from "../entities/swipe.entity";

/** Like réciproque = match immédiat, idempotent (CDC §F3 : une paire = un match). */
export async function getOrCreateMatch(userAId: string, userBId: string): Promise<Match | null> {
  if (userAId === userBId) return null;
  const first = userAId < userBId ? userAId : userBId;
  const second = userAId < userBId ? userBId : userAId;
  const repo = AppDataSource.getRepository(Match);
  const existing = await repo.findOne({ where: { userAId: first, userBId: second } });
  if (existing) return existing;
  try {
    return await repo.save(repo.create({ userAId: first, userBId: second }));
  } catch {
    // course : quelqu'un a créé la paire entre-temps
    return repo.findOne({ where: { userAId: first, userBId: second } });
  }
}

export async function existsRecentLike(swiperUserId: string, targetProfileId: string): Promise<boolean> {
  return AppDataSource.getRepository(Swipe).exists({
    where: { swiperUserId, targetProfileId, action: "like" },
  });
}

export async function listMatches(userId: string): Promise<MatchDto[]> {
  const rows = (await AppDataSource.query(
    `SELECT m.id,
            m.created_at,
            CASE WHEN m.user_a_id = $1 THEN m.user_b_id ELSE m.user_a_id END AS other_user_id,
            p.id AS other_profile_id, p.display_name,
            ph.path_thumb
     FROM matches m
     JOIN profiles p ON p.user_id = (CASE WHEN m.user_a_id = $1 THEN m.user_b_id ELSE m.user_a_id END)
     LEFT JOIN LATERAL (
       SELECT path_thumb FROM photos ph
       WHERE ph.profile_id = p.id AND ph.status = 'approved'
       ORDER BY ph.position ASC LIMIT 1
     ) ph ON true
     WHERE m.user_a_id = $1 OR m.user_b_id = $1
     ORDER BY m.created_at DESC`,
    [userId],
  )) as unknown as Array<{ id: string; created_at: string; other_user_id: string; other_profile_id: string; display_name: string; path_thumb: string | null }>;

  return rows.map((r) => ({
    id: r.id,
    otherProfile: {
      displayName: r.display_name,
      thumbUrl: r.path_thumb ? `/uploads/${r.path_thumb}` : null,
      userId: r.other_user_id,
      profileId: r.other_profile_id,
    },
    created_at: new Date(r.created_at).toISOString(),
  }));
}

/** Renvoie le match si l'utilisateur en fait partie, sinon null. */
export async function getMatchForUser(matchId: string, userId: string): Promise<Match | null> {
  const m = await AppDataSource.getRepository(Match).findOne({ where: { id: matchId } });
  if (!m || (m.userAId !== userId && m.userBId !== userId)) return null;
  return m;
}

export function otherOf(m: Match, userId: string): string {
  return m.userAId === userId ? m.userBId : m.userAId;
}

export async function isBlockedBetween(a: string, b: string): Promise<boolean> {
  return AppDataSource.getRepository(Block).exists({
    where: [
      { blockerUserId: a, blockedUserId: b },
      { blockerUserId: b, blockedUserId: a },
    ],
  });
}

export function messageToDto(m: Message) {
  return { id: m.id, matchId: m.matchId, senderId: m.senderId, body: m.body, createdAt: m.createdAt.toISOString() };
}

/** La carte de l'autre, pour l'écran de match (réutilise les composants du deck). */
export async function cardFor(userId: string): Promise<CardDto | null> {
  const profile = await AppDataSource.getRepository(Profile).findOne({ where: { userId } });
  if (!profile) return null;
  const photo = await AppDataSource.getRepository(Photo).findOne({
    where: { profileId: profile.id, status: "approved" },
    order: { position: "ASC" },
  });
  const user = await AppDataSource.getRepository(User).findOne({ where: { id: userId } });
  if (!user?.birthDate) return null;
  const age = Math.floor((Date.now() - new Date(`${user.birthDate}T00:00:00Z`).getTime()) / (365.25 * 86400000));
  return {
    profileId: profile.id,
    userId,
    displayName: profile.displayName,
    age,
    commune: profile.commune ?? "",
    intention: profile.intention,
    bio: profile.bio,
    mainUrl: photo ? `/uploads/${photo.pathMain}` : "",
    thumbUrl: photo ? `/uploads/${photo.pathThumb}` : "",
    superlikedMe: false,
    distanceKm: null,
  };
}
