import { Router } from "express";
import { BlockSchema, ReportSchema, SendMessageSchema } from "@tipiment/shared";
import { AppError } from "../http/app-error";
import { asyncRoute } from "../http/async-route";
import { clientIp, rateLimit } from "../http/limiter";
import { requireAuth, requireVerified } from "../auth/middleware";
import { AppDataSource } from "../data-source";
import { Block } from "../entities/block.entity";
import { Message } from "../entities/message.entity";
import { Profile } from "../entities/profile.entity";
import { Report } from "../entities/report.entity";
import { getIo } from "../realtime/io";
import {
  getMatchForUser,
  isBlockedBetween,
  messageToDto,
  otherOf,
} from "../services/match.service";

export const chatRouter = Router();

chatRouter.use(requireAuth);

// ---- Blocage (F5) : 1-tap, instantané, silencieux, bidirectionnel
chatRouter.post("/blocks", requireVerified(), asyncRoute(async (req, res) => {
  const user = req.user!;
  const parsed = BlockSchema.safeParse(req.body);
  if (!parsed.success) throw AppError.badRequest("Cible manquante.");
  let blockedUserId = parsed.data.userId ?? null;
  if (!blockedUserId && parsed.data.profileId) {
    const profile = await AppDataSource.getRepository(Profile).findOne({
      where: { id: parsed.data.profileId },
      select: { userId: true },
    });
    blockedUserId = profile?.userId ?? null;
  }
  if (!blockedUserId) throw new AppError(404, "NOT_FOUND", "Profil introuvable.");
  if (blockedUserId === user.id) throw AppError.badRequest("On ne se bloque pas soi-même.");
  const repo = AppDataSource.getRepository(Block);
  const exists = await repo.findOne({ where: { blockerUserId: user.id, blockedUserId: blockedUserId } });
  if (!exists) {
    await repo.save(repo.create({ blockerUserId: user.id, blockedUserId: blockedUserId }));
    getIo()?.to(`user:${user.id}`).to(`user:${blockedUserId}`).emit("blocked", {});
  }
  res.json({ data: { status: "blocked" } });
}));

chatRouter.delete("/blocks/:profileId", requireVerified(), asyncRoute(async (req, res) => {
  const user = req.user!;
  const pid = typeof req.params.profileId === "string" ? req.params.profileId : "";
  const profile = await AppDataSource.getRepository(Profile).findOne({ where: { id: pid }, select: { userId: true } });
  if (!profile) throw new AppError(404, "NOT_FOUND", "Profil introuvable.");
  await AppDataSource.getRepository(Block).delete({ blockerUserId: user.id, blockedUserId: profile.userId });
  res.json({ data: { status: "unblocked" } });
}));

// ---- Signalement (F5) : motifs fermés, accusé < 24 h
chatRouter.post("/reports", requireVerified(), rateLimit({ key: (r) => `rep${clientIp(r)}`, max: 20, windowSec: 3600 }), asyncRoute(async (req, res) => {
  const user = req.user!;
  const parsed = ReportSchema.safeParse(req.body);
  if (!parsed.success) throw AppError.badRequest("Signalement invalide.");
  const profile = await AppDataSource.getRepository(Profile).findOne({
    where: { id: parsed.data.targetProfileId },
    select: { id: true },
  });
  if (!profile) throw new AppError(404, "NOT_FOUND", "Profil introuvable.");
  await AppDataSource.getRepository(Report).save(
    AppDataSource.getRepository(Report).create({
      reporterId: user.id,
      targetProfileId: profile.id,
      reason: parsed.data.reason,
      detail: parsed.data.detail ?? null,
    }),
  );
  res.status(201).json({ data: { status: "submitted", sla: "<24h" } });
}));

// ---- Messages REST (fallback hors websocket, CDC §7.1)
chatRouter.get("/matches/:matchId/messages", requireVerified(), asyncRoute(async (req, res) => {
  const user = req.user!;
  const match = await getMatchForUser(String(req.params.matchId ?? ""), user.id);
  if (!match) throw new AppError(404, "NOT_FOUND", "Match introuvable.");
  if (await isBlockedBetween(user.id, otherOf(match, user.id))) {
    res.json({ data: { messages: [], nextCursor: null, frozen: true } });
    return;
  }
  const cursor = typeof req.query.cursor === "string" ? req.query.cursor : null;
  const messages = await AppDataSource.getRepository(Message).find({
    where: { matchId: match.id, ...(cursor ? { createdAt: cursor as unknown as Date } : {}) },
    order: { createdAt: "DESC" },
    take: 50,
  });
  void cursor;
  res.json({
    data: {
      messages: messages.map(messageToDto).reverse(),
      nextCursor: messages.length === 50 ? messages[messages.length - 1]!.createdAt.toISOString() : null,
      frozen: false,
    },
  });
}));

chatRouter.post(
  "/matches/:matchId/messages",
  requireVerified(),
  rateLimit({ key: (r) => `msg${clientIp(r)}`, max: 60, windowSec: 60 }),
  asyncRoute(async (req, res) => {
    const user = req.user!;
    const match = await getMatchForUser(String(req.params.matchId ?? ""), user.id);
    if (!match) throw new AppError(404, "NOT_FOUND", "Match introuvable.");
    if (await isBlockedBetween(user.id, otherOf(match, user.id))) {
      throw new AppError(403, "CONVERSATION_FROZEN", "Conversation figée.");
    }
    const parsed = SendMessageSchema.safeParse(req.body);
    if (!parsed.success) throw AppError.badRequest("Message invalide.");
    const repo = AppDataSource.getRepository(Message);
    const existing = await repo.findOne({ where: { senderId: user.id, clientUuid: parsed.data.clientUuid } });
    if (existing) {
      res.json({ data: messageToDto(existing) });
      return;
    }
    const message = await repo.save(
      repo.create({ matchId: match.id, senderId: user.id, body: parsed.data.body, clientUuid: parsed.data.clientUuid, deliveredAt: new Date() }),
    );
    getIo()?.to(`match:${match.id}`).emit("message:new", messageToDto(message));
    res.status(201).json({ data: messageToDto(message) });
  }),
);
