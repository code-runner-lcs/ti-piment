import { hash } from "@node-rs/argon2";
import { AppDataSource } from "../data-source";
import { User } from "../entities/user.entity";

/**
 * Données de test (DEV UNIQUEMENT) :
 *   pnpm --filter @tipiment/api seed
 *
 * Idempotent : les emails déjà présents sont passés. Refuse de tourner en production.
 * Emails en .test (TLD réservé aux tests) — jamais de vraies adresses ici.
 * Mot de passe commun (dev) : Tipiment-dev-2026
 */
const DEV_PASSWORD = "Tipiment-dev-2026";

type SeedUser = {
  email: string;
  role: "user" | "admin";
  emailVerified: boolean;
  birthDate: string;
  purpose: string;
};

const USERS: SeedUser[] = [
  { email: "alice@tipiment.test",   role: "user",  emailVerified: true,  birthDate: "1996-04-12", purpose: "user vérifié (flux nominal)" },
  { email: "bob@tipiment.test",     role: "user",  emailVerified: true,  birthDate: "1997-09-23", purpose: "second user (tests de deck/match M2)" },
  { email: "diane@tipiment.test",   role: "user",  emailVerified: true,  birthDate: "2005-11-30", purpose: "jeune adulte (edge 18+)" },
  { email: "charlie@tipiment.test", role: "user",  emailVerified: false, birthDate: "1994-01-05", purpose: "SANS vérification email (gate M1 « Vérifie ton email »)" },
  { email: "admin@tipiment.test",   role: "admin", emailVerified: true,  birthDate: "1988-07-07", purpose: "admin (back-office M1)" },
];

async function main(): Promise<void> {
  if (process.env.NODE_ENV === "production") {
    throw new Error("seed interdit en production");
  }
  await AppDataSource.initialize();
  try {
    const repo = AppDataSource.getRepository(User);
    const passwordHash = await hash(DEV_PASSWORD, { memoryCost: 19456, timeCost: 2, parallelism: 1 });

    let created = 0;
    let skipped = 0;
    for (const u of USERS) {
      const exists = await repo.findOne({ where: { email: u.email } });
      if (exists) {
        skipped++;
        console.log(`[seed] déjà présent  : ${u.email}`);
        continue;
      }
      const user = repo.create({
        email: u.email, // email déjà lowercase -> on écrit normalisé (CDC §4.1)
        passwordHash,
        role: u.role,
        emailVerified: u.emailVerified,
      });
      await repo.save(user);
      created++;
      console.log(`[seed] créé          : ${u.email} (${u.purpose})`);
    }
    console.log(`[seed] terminé — ${created} créé(s), ${skipped} déjà là. Mot de passe dev : ${DEV_PASSWORD}`);
  } finally {
    await AppDataSource.destroy();
  }
}

main().catch((err: unknown) => {
  console.error("[seed] échec:", err instanceof Error ? `${err.message}\n${err.stack ?? ""}` : err);
  process.exit(1);
});
