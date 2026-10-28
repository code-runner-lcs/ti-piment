import type { Response } from "express";
import { config } from "../config";

export function setRefreshCookie(res: Response, plain: string): void {
  res.cookie(config.refresh.cookieName, plain, {
    httpOnly: true,
    sameSite: "lax",
    secure: config.isProd,
    path: "/api/auth",
    maxAge: config.refresh.ttlDays * 86_400_000,
  });
}

export function clearRefreshCookie(res: Response): void {
  res.clearCookie(config.refresh.cookieName, { path: "/api/auth" });
}

export function refreshCookieFrom(req: { cookies?: Record<string, string | undefined> }): string | null {
  return req.cookies?.[config.refresh.cookieName] ?? null;
}
