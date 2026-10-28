import { Router } from "express";
import { CitiesSearchSchema } from "@tipiment/shared";
import { AppError } from "../http/app-error";
import { asyncRoute } from "../http/async-route";
import { clientIp, rateLimit } from "../http/limiter";
import { requireAuth } from "../auth/middleware";
import { searchCities } from "../services/cities.service";

export const citiesRouter = Router();

citiesRouter.use(requireAuth);

citiesRouter.get("/search", rateLimit({ key: (r) => `cities${clientIp(r)}`, max: 60, windowSec: 60 }), asyncRoute(async (req, res) => {
  const parsed = CitiesSearchSchema.safeParse(req.query);
  if (!parsed.success) throw AppError.badRequest("Requête invalide (q, 2 caractères min).");
  const cities = await searchCities(parsed.data.q);
  res.json({ data: cities });
}));
