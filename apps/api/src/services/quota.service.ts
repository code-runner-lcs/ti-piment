import { redisReady } from "../lib/redis";
import { config } from "../config";
import { AppError } from "../http/app-error";

const MAX_LIKES = () => config.quotas.maxLikes;
const MAX_SUPER = () => config.quotas.maxSuperlikes;
const TZ = () => config.quotas.timezone;

const fmtParis = () =>
  new Intl.DateTimeFormat("en-US", {
    timeZone: TZ(),
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

function wallParts(d: Date): { y: string; mo: string; day: string; h: string; mi: string; s: string } {
  const o: Record<string, string> = {};
  for (const p of fmtParis().formatToParts(d)) o[p.type] = p.value;
  const h = o.hour === "24" ? "00" : o.hour!;
  return { y: o.year!, mo: o.month!, day: o.day!, h, mi: o.minute!, s: o.second! };
}

/** Décalage tz (ms) mesuré à l'instant donné — précision seconde suffit hors bascule DST (02-03h Paris). */
function tzOffsetMs(d: Date): number {
  const w = wallParts(d);
  const asIfUtc = Date.parse(`${w.y}-${w.mo}-${w.day}T${w.h}:${w.mi}:${w.s}Z`);
  return asIfUtc - Math.floor(d.getTime() / 1000) * 1000;
}

/** Instant UTC du prochain 00:00 dans le fuseau des quotas (DST-aware). */
export function nextMidnightUtc(now = new Date(), tzOnlyOffset = tzOffsetMs(now)): Date {
  const tomorrow = new Date(now.getTime() + 86_400_000);
  const w = wallParts(tomorrow);
  const asIfUtc = Date.parse(`${w.y}-${w.mo}-${w.day}T00:00:00Z`);
  return new Date(asIfUtc - tzOnlyOffset);
}

const dayKey = (now = new Date()): string =>
  wallParts(now).y + "-" + wallParts(now).mo + "-" + wallParts(now).day;

const likeKey = (userId: string): string => `q:like:${dayKey()}:${userId}`;
const superKey = (userId: string): string => `q:super:${dayKey()}:${userId}`;

const ttlSec = (): number => Math.max(60, Math.ceil((nextMidnightUtc().getTime() - Date.now()) / 1000));

export interface QuotaState {
  likes: number;
  superlikes: number;
  resetsAt: Date;
}

export async function getQuotas(userId: string): Promise<QuotaState> {
  const c = await redisReady();
  const [usedLikes, usedSuper] = await Promise.all([
    c.get(likeKey(userId)).then((v) => Number(v ?? 0)),
    c.get(superKey(userId)).then((v) => Number(v ?? 0)),
  ]);
  return {
    likes: Math.max(0, MAX_LIKES() - usedLikes),
    superlikes: Math.max(0, MAX_SUPER() - usedSuper),
    resetsAt: nextMidnightUtc(),
  };
}

async function consume(key: string, max: number, code: string, message: string): Promise<void> {
  const c = await redisReady();
  const used = await c.incr(key);
  if (used === 1) await c.expire(key, ttlSec());
  if (used > max) {
    await c.decr(key);
    throw new AppError(403, code, message);
  }
}

export async function consumeLike(userId: string): Promise<void> {
  await consume(likeKey(userId), MAX_LIKES(), "QUOTA_LIKES", "Plus de likes aujourd'hui — on remet ça à minuit.");
}

export async function consumeSuperlike(userId: string): Promise<void> {
  await consume(superKey(userId), MAX_SUPER(), "QUOTA_SUPERLIKES", "Ton super-like du jour est déjà parti ⚡");
}
