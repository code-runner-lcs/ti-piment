import type { Server as SocketServer } from "socket.io";

let io: SocketServer | null = null;

export function setIo(server: SocketServer): void {
  io = server;
}

export function getIo(): SocketServer | null {
  return io;
}
