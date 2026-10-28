import type { NextFunction, Request, Response } from "express";
import { AppError } from "../http/app-error";
import { verifyAccessToken } from "./jwt";

export function requireAuth(req: Request, _res: Response, next: NextFunction): void {
  const [scheme, token] = (req.headers.authorization ?? "").split(" ");
  if (scheme !== "Bearer" || !token) {
    next(AppError.unauthorized());
    return;
  }
  verifyAccessToken(token)
    .then((user) => {
      req.user = user;
      next();
    })
    .catch((err: unknown) => next(err instanceof AppError ? err : AppError.unauthorized("Token invalide")));
}
