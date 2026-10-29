import type { Server as HttpServer } from "node:http";
import { Server as SocketServer, type Socket } from "socket.io";
import { verifyAccessToken } from "../auth/jwt";
import { AppDataSource } from "../data-source";
import { config } from "../config";
import { getIo, setIo } from "./io";
import { Block } from "../entities/block.entity";
import { Match } from "../entities/match.entity";
import { Message } from "../entities/message.entity";
import { redisReady } from "../lib/redis";

const MSG_PER_MIN = 30;   // CDC §9
const MSG_PER_HOUR = 100;
const BODY_MAX = 1000;

async function chatRateLimited(userId: string): Promise<boolean> {
  const c = await redisReady();
  const m = await c.incr(`rlm:msg:${userId}`);
  if (m === 1) await c.expire(`rlm:msg:${userId}`, 60);
  const h = await c.incr(`rlm:msgH:${userId}`);
  if (h === 1) await c.expire(`rlm:msgH:${userId}`, 3600);
  return m > MSG_PER_MIN || h > MSG_PER_HOUR;
}

async function areBlocked(a: string, b: string): Promise<boolean> {
  return AppDataSource.getRepository(Block).exists({
    where: [
      { blockerUserId: a, blockedUserId: b },
      { blockerUserId: b, blockedUserId: a },
    ],
  });
}

export function attachRealtime(server: HttpServer): SocketServer {
  const io = new SocketServer(server, { cors: { origin: config.webUrl ?? true, credentials: true } });
  setIo(io);

  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token as string | undefined;
      if (!token) return next(new Error("UNAUTHORIZED"));
      socket.data.user = await verifyAccessToken(token);
      next();
    } catch {
      next(new Error("UNAUTHORIZED"));
    }
  });

  io.on("connection", (socket: Socket) => {
    const userId = socket.data.user.id as string;
    void socket.join(`user:${userId}`); // salon direct : notifications (blocked, match:new)

    // auto-join des rooms de ses matchs actifs (le serveur join, jamais le client)
    void AppDataSource.getRepository(Match)
      .find({ where: [{ userAId: userId }, { userBId: userId }] })
      .then((matches) => {
        for (const m of matches) void socket.join(`match:${m.id}`);
      })
      .catch(() => undefined);

    socket.on("message:send", async (payload: { matchId?: string; clientUuid?: string; body?: string }, ack?: (r: unknown) => void) => {
      try {
        const matchId = payload?.matchId;
        const clientUuid = payload?.clientUuid;
        const body = payload?.body?.trim();
        if (!matchId || !clientUuid || !body || body.length > BODY_MAX || body.length < 1) {
          ack?.({ error: "INVALID" });
          return;
        }
        const match = await AppDataSource.getRepository(Match).findOne({ where: { id: matchId } });
        if (!match || (match.userAId !== userId && match.userBId !== userId)) {
          ack?.({ error: "NOT_MEMBER" });
          return;
        }
        const other = match.userAId === userId ? match.userBId : match.userAId;
        if (await areBlocked(userId, other)) {
          ack?.({ error: "CONVERSATION_FROZEN" });
          return;
        }
        if (await chatRateLimited(userId)) {
          ack?.({ error: "RATE_LIMITED" });
          return;
        }
        const repo = AppDataSource.getRepository(Message);
        const existing = await repo.findOne({ where: { senderId: userId, clientUuid } });
        const message =
          existing ??
          (await repo.save(repo.create({ matchId, senderId: userId, body, clientUuid, deliveredAt: new Date() })));
        // CDC : persisté AVANT diffusion — Socket.IO n'est qu'un transport
        io.to(`match:${matchId}`).emit("message:new", {
          id: message.id, matchId, senderId: message.senderId, body: message.body,
          createdAt: message.createdAt.toISOString(),
        });
        ack?.({ message: { id: message.id, matchId, senderId: message.senderId, body: message.body, createdAt: message.createdAt.toISOString() } });
      } catch {
        ack?.({ error: "INTERNAL" });
      }
    });

    socket.on("typing", async (payload: { matchId?: string }) => {
      const matchId = payload?.matchId;
      if (!matchId) return;
      const match = await AppDataSource.getRepository(Match).findOne({ where: { id: matchId } });
      if (!match || (match.userAId !== userId && match.userBId !== userId)) return;
      const c = await redisReady();
      const n = await c.incr(`rlm:typ:${userId}:${matchId}`);
      if (n === 1) await c.expire(`rlm:typ:${userId}:${matchId}`, 2);
      if (n <= 2) socket.to(`match:${matchId}`).except(socket.id).emit("typing", { matchId, userId });
    });
  });

  return io;
}

/** Notification directe : gel de conversation (F5), émis aux salons utilisateurs. */
export function emitBlocked(a: string, b: string): void {
  getIo()?.to(`user:${a}`).to(`user:${b}`).emit("blocked", {});
}
