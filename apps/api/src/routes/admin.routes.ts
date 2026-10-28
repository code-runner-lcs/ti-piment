import { Router } from "express";
import { AppError } from "../http/app-error";
import { asyncRoute } from "../http/async-route";
import { requireAdmin, requireAuth } from "../auth/middleware";
import { AppDataSource } from "../data-source";
import { Photo } from "../entities/photo.entity";
import { recomputeCompletion } from "../services/profile.service";

export const adminRouter = Router();

const paramId = (req: { params: Record<string, string | string[] | undefined> }, name: string): string => {
  const v = req.params[name];
  return typeof v === "string" ? v : Array.isArray(v) ? (v[0] ?? "") : "";
};

adminRouter.use(requireAuth, requireAdmin());

adminRouter.get("/photos", asyncRoute(async (req, res) => {
  const status = typeof req.query.status === "string" ? (req.query.status as string) : null;
  const where = status && ["pending", "approved", "rejected"].includes(status) ? { status: status as "pending" | "approved" | "rejected" } : {};
  const photos = await AppDataSource.getRepository(Photo).find({ where, order: { createdAt: "ASC" }, take: 50 });
  res.json({ data: photos.map((p) => ({ id: p.id, userId: p.userId, status: p.status, mainUrl: `/uploads/${p.pathMain}` })) });
}));

adminRouter.post("/photos/:id/approve", asyncRoute(async (req, res) => {
  const photo = await AppDataSource.getRepository(Photo).findOne({ where: { id: paramId(req, "id") } });
  if (!photo) throw new AppError(404, "NOT_FOUND", "Photo inconnue.");
  photo.status = "approved";
  await AppDataSource.getRepository(Photo).save(photo);
  await recomputeCompletion(photo.userId);
  res.json({ data: { id: photo.id, status: photo.status } });
}));

adminRouter.post("/photos/:id/reject", asyncRoute(async (req, res) => {
  const photo = await AppDataSource.getRepository(Photo).findOne({ where: { id: paramId(req, "id") } });
  if (!photo) throw new AppError(404, "NOT_FOUND", "Photo inconnue.");
  photo.status = "rejected";
  await AppDataSource.getRepository(Photo).save(photo);
  await recomputeCompletion(photo.userId);
  res.json({ data: { id: photo.id, status: photo.status } });
}));
