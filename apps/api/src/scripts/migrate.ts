import { AppDataSource } from "../data-source";

// Runner de migrations programmatique (les migrations restent des fichiers
// MigrationInterface écrits à la main dans src/migrations).
async function main(): Promise<void> {
  const ds = AppDataSource;
  await ds.initialize();
  try {
    const migrations = await ds.runMigrations();
    if (migrations.length === 0) {
      console.log("[migrate] aucune migration à exécuter — base déjà à jour");
    } else {
      for (const m of migrations) {
        console.log(`[migrate] appliquée: ${m.name}`);
      }
    }
  } finally {
    await ds.destroy();
  }
}

main().catch((err: unknown) => {
  console.error("[migrate] échec:", err instanceof Error ? `${err.message}\n${err.stack ?? ""}` : err);
  process.exit(1);
});
