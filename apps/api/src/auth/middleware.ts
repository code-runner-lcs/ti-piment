import type { NextFunction, Request, Response } from "express";
import { AppError } from "../http/app-error";
import { AppDataSource } from "../data-source";
import { User } from "../entities/user.entity";
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

type Handler3 = (req: Request, res: Response, next: NextFunction) => Promise<void> | void;

/** Décision V1.1 : email non vérifié → aucune écriture utile (profil, photos, préférences). */
export const requireVerified = (): Handler3 => async (req, _res, next) => {
  try {
    const id = req.user?.id;
    if (!id) throw AppError.unauthorized();
    const fresh = await AppDataSource.getRepository(User).findOne({
      where: { id },
      select: { id: true, emailVerified: true },
    });
    if (!fresh) throw AppError.unauthorized("Compte introuvable");
    if (!fresh.emailVerified) {
      throw new AppError(403, "EMAIL_NOT_VERIFIED", "Vérifie ton email pour continuer.");
    }
    next();
  } catch (err) {
    next(err);
  }
};

export const requireAdmin = (): Handler3 => (req, _res, next) => {
  if (req.user?.role !== "admin") {
    next(new AppError(403, "FORBIDDEN", "Accès réservé aux administrateurs."));
    return;
  }
  next();
};
