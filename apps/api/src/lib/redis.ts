import { Redis } from "ioredis";
import { config } from "../config";

let client: Redis | null = null;
let connecting: Promise<Redis> | null = null;

/** Client lazy : toute commande doit passer par redisReady() (connect attendu). */
export function redis(): Redis {
  if (!client) {
    client = new Redis(config.redis.url, {
      lazyConnect: true,
      enableOfflineQueue: false,
      maxRetriesPerRequest: 1,
    });
  }
  return client;
}

export async function redisReady(): Promise<Redis> {
  const c = redis();
  if (c.status === "ready" || c.status === "connect") return c;
  if (!connecting) {
    connecting = c
      .connect()
      .then(() => c)
      .catch((err: unknown) => {
        connecting = null;
        client = null; // prochaine tentative : client neuf
        throw err;
      });
  }
  return connecting;
}
