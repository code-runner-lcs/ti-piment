import { io, type Socket } from "socket.io-client";
import { session } from "../store/session";

let sock: Socket | null = null;

export function chatSocket(): Socket {
  if (!sock || sock.disconnected) {
    sock = io(import.meta.env.VITE_API_URL ?? window.location.origin, {
      auth: { token: session()?.accessToken },
      transports: ["websocket"],
    });
  } else {
    sock.auth = { token: session()?.accessToken };
  }
  return sock;
}

export function closeSocket(): void {
  sock?.disconnect();
  sock = null;
}
