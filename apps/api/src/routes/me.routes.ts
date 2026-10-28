import { Router } from "express";
import { AppError } from "../http/app-error";
import { requireAuth } from "../auth/middleware";

export const meRouter = Router();

// Toutes les routes /api/me sont protégées (CDC §4.2 : middleware requireAuth)
meRouter.use(requireAuth);

meRouter.get("/", (req, res) => {
  const user = req.user;
  if (!user) throw AppError.unauthorized();
  res.json({ data: user });
});

/** Boucle M0 : le « hello world » authentifié */
meRouter.get("/hello", (req, res) => {
  const user = req.user;
  if (!user) throw AppError.unauthorized();
  res.json({
    data: { message: `Bonjour ${user.email} — la boucle authentifiée M0 est OK 👋` },
  });
});
