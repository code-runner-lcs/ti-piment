import { createHash, randomBytes } from "node:crypto";
import { IsNull, MoreThan } from "typeorm";
import { AppDataSource } from "../data-source";
import { AppError } from "../http/app-error";
import { RefreshToken } from "../entities/refresh-token.entity";
import { config } from "../config";
import type { SessionUser } from "@tipiment/shared";

const repo = () => AppDataSource.getRepository(RefreshToken);
const sha = (t: string) => createHash("sha256").update(t).digest("hex");
const raw = () => randomBytes(32).toString("base64url");
const maxAgeMs = () => config.refresh.ttlDays * 86_400_000;

export async function issueFamily(userId: string, familyId?: string, userAgent?: string) {
  const plain = raw();
  const row = repo().create({
    userId,
    tokenHash: sha(plain),
    familyId: familyId ?? crypto.randomUUID(),
    expiresAt: new Date(Date.now() + maxAgeMs()),
    userAgent: userAgent ? userAgent.slice(0, 200) : null,
  });
  await repo().save(row);
  return { plain, familyId: row.familyId };
}

/** Plafond de 5 sessions actives : les plus anciennes sont révoquées (CDC §4.2). */
export async function enforceMaxSessions(userId: string): Promise<void> {
  const active = await repo().find({
    where: { userId, revokedAt: IsNull(), expiresAt: MoreThan(new Date()) },
    order: { createdAt: "ASC" },
  });
  const excess = active.length - (config.refresh.maxSessions - 1);
  if (excess > 0) {
    await repo().update(active.slice(0, excess).map((r) => r.id), { revokedAt: new Date() });
  }
}

export async function revokeFamily(familyId: string): Promise<void> {
  await repo().update({ familyId, revokedAt: IsNull() }, { revokedAt: new Date() });
}

export async function revokeAll(userId: string): Promise<void> {
  await repo().update({ userId, revokedAt: IsNull() }, { revokedAt: new Date() });
}

export async function logout(plain: string): Promise<void> {
  const row = await repo().findOne({ where: { tokenHash: sha(plain) } });
  if (!row) return;
  if (row.revokedAt) {
    await revokeFamily(row.familyId);
    return;
  }
  row.revokedAt = new Date();
  await repo().save(row);
}

/**
 * Rotation + détection de vol : réutiliser un token déjà consommé révoque la
 * FAMILLE ENTIÈRE (CDC §4.2). Renvoie le user + le NOUVEAU token brut.
 */
export async function rotate(plain: string, userAgent?: string): Promise<{ user: SessionUser; nextPlain: string }> {
  const row = await repo().findOne({ where: { tokenHash: sha(plain) }, relations: { user: true } });
  if (!row || row.expiresAt < new Date()) throw AppError.unauthorized("Session invalide");
  if (row.revokedAt) {
    await revokeFamily(row.familyId);
    throw new AppError(401, "REFRESH_REUSED", "Session révoquée — reconnecte-toi.");
  }
  row.revokedAt = new Date();
  await repo().save(row);
  const user = row.user;
  if (!user || user.passwordHash === "!") throw AppError.unauthorized("Session invalide");
  const { plain: nextPlain } = await issueFamily(row.userId, row.familyId, userAgent ?? row.userAgent ?? undefined);
  return { user: user.toSessionUser(), nextPlain };
}
