import type { Request, RequestHandler, Response } from "express";
import { redisReady } from "../lib/redis";
import { AppError } from "./app-error";

/**
 * Fenêtre fixe INCR/EXPIRE sous Redis. Fail-CLOSED (503) : sans compteur, les
 * routes d'auth ne passent pas (CDC §10).
 * refundOnSuccess : le succès N'EST PAS compté — la limite porte sur les échecs
 * (5 tentatives échouées / 15 min sur login, CDC §4.3), pas sur les connexions.
 */
export function rateLimit(opts: {
  key: (req: Request) => string;
  max: number;
  windowSec: number;
  refundOnSuccess?: boolean;
}): RequestHandler {
  return (_req, res, next) => {
    void (async () => {
      const c = await redisReady();
      const key = `rl:${opts.key(_req)}`;
      const hits = await c.incr(key);
      if (hits === 1) await c.expire(key, opts.windowSec);
      if (hits > opts.max) {
        const ttl = await c.ttl(key);
        res.setHeader("Retry-After", ttl > 0 ? ttl : opts.windowSec);
        throw new AppError(429, "RATE_LIMITED", "Trop de tentatives — réessaie plus tard.");
      }
      if (opts.refundOnSuccess) res.locals.__rlKey = key;
      next();
    })().catch((err: unknown) =>
      next(err instanceof AppError ? err : new AppError(503, "SERVICE_UNAVAILABLE", "Service temporairement indisponible.")),
    );
  };
}

/** Appelé quand la route réussit — il faut l'AWAITER avant la réponse : le décr
 * doit passer avant le INCR de la requête suivante (sinon course de compteurs). */
export async function refundRateLimit(res: Response): Promise<void> {
  const key = res.locals.__rlKey as string | undefined;
  if (!key) return;
  delete res.locals.__rlKey;
  try {
    const c = await redisReady();
    await c.decr(key);
  } catch {
    // pas bloquant : le pire cas est un compteur gonflé qui s'expire seul
  }
}

export const clientIp = (req: Request): string => req.ip ?? "unknown";
