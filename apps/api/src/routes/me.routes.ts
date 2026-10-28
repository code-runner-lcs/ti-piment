import { Router } from "express";
import { PreferencesSchema, ProfileSchema } from "@tipiment/shared";
import { AppError } from "../http/app-error";
import { asyncRoute } from "../http/async-route";
import { requireAdmin, requireAuth, requireVerified } from "../auth/middleware";
import { uploadSingle } from "../http/upload";
import {
  addPhoto,
  anonymiseAccount,
  deletePhoto,
  getProfileBundle,
  photoToDto,
  upsertPreferences,
  upsertProfile,
} from "../services/profile.service";

export const meRouter = Router();

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
  res.json({ data: { message: `Bonjour ${user.email} — la boucle authentifiée M0 est OK 👋` } });
});

meRouter.get("/profile", asyncRoute(async (req, res) => {
  const user = req.user;
  if (!user) throw AppError.unauthorized();
  const bundle = await getProfileBundle(user.id);
  res.json({
    data: {
      completed: bundle.completed,
      profile: bundle.profile
        ? {
            displayName: bundle.profile.displayName,
            intention: bundle.profile.intention,
            gender: bundle.profile.gender,
            seeking: bundle.profile.seeking,
            bio: bundle.profile.bio,
            commune: bundle.profile.commune,
            emailVerified: user.emailVerified,
            completed: bundle.completed,
          }
        : null,
      preferences: bundle.preferences
        ? {
            ageMin: bundle.preferences.ageMin,
            ageMax: bundle.preferences.ageMax,
            distanceKm: bundle.preferences.distanceKm,
            intention: bundle.preferences.intention,
          }
        : null,
      photos: bundle.photos.map(photoToDto),
    },
  });
}));

// Écritures profil/préférences/photos : EMAIL VÉRIFIÉ OBLIGATOIRE (décision V1.1)
meRouter.put("/profile", requireVerified(), asyncRoute(async (req, res) => {
  const user = req.user;
  if (!user) throw AppError.unauthorized();
  const parsed = ProfileSchema.safeParse(req.body);
  if (!parsed.success) throw AppError.badRequest(parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "));
  await upsertProfile(user.id, parsed.data);
  res.json({ data: { status: "saved" } });
}));

meRouter.put("/preferences", requireVerified(), asyncRoute(async (req, res) => {
  const user = req.user;
  if (!user) throw AppError.unauthorized();
  const parsed = PreferencesSchema.safeParse(req.body);
  if (!parsed.success) throw AppError.badRequest(parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "));
  await upsertPreferences(user.id, parsed.data);
  res.json({ data: { status: "saved" } });
}));

meRouter.post("/photos", requireVerified(), (req, res, next) => {
  uploadSingle(req, res, (err?: unknown) => {
    if (err) {
      next(err);
      return;
    }
    void (async () => {
      const user = req.user;
      if (!user) throw AppError.unauthorized();
      const buf = (req as { file?: Express.Multer.File }).file?.buffer;
      if (!buf) throw AppError.badRequest("Fichier manquant.", "FILE_MISSING");
      const photo = await addPhoto(user, buf);
      res.status(201).json({ data: photoToDto(photo) });
    })().catch(next);
  });
});

meRouter.delete("/photos/:id", asyncRoute(async (req, res) => {
  const user = req.user;
  if (!user) throw AppError.unauthorized();
  const rawId = req.params.id;
  const pid = typeof rawId === "string" ? rawId : (Array.isArray(rawId) ? rawId[0] ?? "" : "");
  await deletePhoto(user.id, pid);
  res.json({ data: { status: "deleted" } });
}));

/** Suppression du compte : anomalisation immédiate (RGPD, CDC §4.3) — non soumise au gate email */
meRouter.delete("/", asyncRoute(async (req, res) => {
  const user = req.user;
  if (!user) throw AppError.unauthorized();
  await anonymiseAccount(user, req.headers["user-agent"]);
  res.status(204).send();
}));

void requireAdmin; // (admin router séparé)
