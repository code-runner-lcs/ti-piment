import { createServer } from "node:http";
import { buildApp } from "./app";
import { attachRealtime } from "./realtime/socket";
import { config } from "./config";

async function main(): Promise<void> {
  const app = await buildApp();
  const server = createServer(app);
  attachRealtime(server);
  server.listen(config.port, () => {
    console.log(`[api] prêt sur http://localhost:${config.port} (socket.io actif)`);
  });
}

main().catch((err: unknown) => {
  console.error("[api] démarrage impossible:", err);
  process.exit(1);
});
