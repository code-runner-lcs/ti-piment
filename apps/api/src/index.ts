import { buildApp } from "./app";
import { config } from "./config";

async function main(): Promise<void> {
  const app = await buildApp();
  app.listen(config.port, () => {
    console.log(`[api] prêt sur http://localhost:${config.port}`);
  });
}

main().catch((err: unknown) => {
  console.error("[api] démarrage impossible:", err);
  process.exit(1);
});
