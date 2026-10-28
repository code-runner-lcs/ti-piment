import { hash } from "@node-rs/argon2";
import sharp from "sharp";
import { promises as fs } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { AppDataSource } from "../data-source";
import { Photo } from "../entities/photo.entity";
import { Profile, GENDERS, INTENTIONS, SEEKING } from "../entities/profile.entity";
import { User } from "../entities/user.entity";
import { resolveExactName } from "../services/cities.service";
import { config } from "../config";

/**
 * Données de test (DEV UNIQUEMENT) : pnpm --filter @tipiment/api seed
 * Idempotent, refuse la prod, emails .test. Crée profils complets + 2 photos
 * GÉNÉRÉES par sharp (de vrais fichiers WebP) pour peupler les decks M2.
 * Mot de passe commun dev : Tipiment-dev-2026
 */
const DEV_PASSWORD = "Tipiment-dev-2026";

type SeedUser = {
  email: string;
  role: "user" | "admin";
  emailVerified: boolean;
  birthDate: string;
  profile: {
    displayName: string;
    intention: (typeof INTENTIONS)[number];
    gender: (typeof GENDERS)[number];
    seeking: (typeof SEEKING)[number];
    commune: string;
    bio: string;
  };
  colors: [string, string];
};

const USERS: SeedUser[] = [
  {
    email: "alice@tipiment.test", role: "user", emailVerified: true, birthDate: "1996-04-12",
    profile: { displayName: "Alice", intention: "relation_serieuse", gender: "femme", seeking: "tous", commune: "Toulon", bio: "Plutôt montagne que plage." },
    colors: ["#e76f51", "#f4a261"],
  },
  {
    email: "bob@tipiment.test", role: "user", emailVerified: true, birthDate: "1997-09-23",
    profile: { displayName: "Bob", intention: "sortir_decouvrir", gender: "homme", seeking: "femme", commune: "Reims", bio: "Cinéma, cuisine, longues marches." },
    colors: ["#2a9d8f", "#264653"],
  },
  {
    email: "diane@tipiment.test", role: "user", emailVerified: true, birthDate: "2005-11-30",
    profile: { displayName: "Diane", intention: "a_voir", gender: "femme", seeking: "tous", commune: "Nantes", bio: "Étudiante, musiques du monde." },
    colors: ["#e9c46a", "#8ab17d"],
  },
  {
    email: "charlie@tipiment.test", role: "user", emailVerified: false, birthDate: "1994-01-05",
    profile: { displayName: "Charlie", intention: "relation_serieuse", gender: "homme", seeking: "tous", commune: "Angers", bio: "Non vérifié — gate email." },
    colors: ["#6d597a", "#b56576"],
  },
  {
    email: "admin@tipiment.test", role: "admin", emailVerified: true, birthDate: "1988-07-07",
    profile: { displayName: "Admin", intention: "a_voir", gender: "autre", seeking: "tous", commune: "Nice", bio: "Compte back-office." },
    colors: ["#355070", "#6d597a"],
  },
];

async function makePhoto(userId: string, color: string, index: number): Promise<Photo> {
  const dir = path.join(config.photos.uploadsDir, userId);
  await fs.mkdir(dir, { recursive: true });
  const idOut = randomUUID();
  await fs.writeFile(path.join(dir, `${idOut}.webp`),
    await sharp({ create: { width: 800, height: 800, channels: 3, background: color } }).webp({ quality: 92 }).toBuffer());
  await fs.writeFile(path.join(dir, `${idOut}-main.webp`),
    await sharp({ create: { width: 1080, height: 1080, channels: 3, background: color } }).webp({ quality: 88 }).toBuffer());
  await fs.writeFile(path.join(dir, `${idOut}-thumb.webp`),
    await sharp({ create: { width: 480, height: 480, channels: 3, background: color } }).webp({ quality: 82 }).toBuffer());
  return AppDataSource.getRepository(Photo).create({
    userId,
    profileId: "", // rempli après save du profil
    pathOrig: `${userId}/${idOut}.webp`,
    pathMain: `${userId}/${idOut}-main.webp`,
    pathThumb: `${userId}/${idOut}-thumb.webp`,
    position: index,
    status: "approved", // fixtures dev : publiables direct
  });
}

async function main(): Promise<void> {
  if (process.env.NODE_ENV === "production") throw new Error("seed interdit en production");
  await AppDataSource.initialize();
  try {
    const passwordHash = await hash(DEV_PASSWORD, { memoryCost: 19456, timeCost: 2, parallelism: 1 });
    let created = 0;
    for (const u of USERS) {
      const userRepo = AppDataSource.getRepository(User);
      const exists = await userRepo.findOne({ where: { email: u.email } });
      if (exists) {
        console.log(`[seed] déjà présent : ${u.email}`);
        continue;
      }
      const user = userRepo.create({
        email: u.email,
        passwordHash,
        role: u.role,
        emailVerified: u.emailVerified,
        birthDate: u.birthDate,
        lastActiveAt: new Date(),
      });
      await userRepo.save(user);
      // résolution INSEE (geo.api.gouv.fr) : si indisponible, commune_insee reste null (distance inconnue)
      const city = await resolveExactName(u.profile.commune).catch(() => null);
      const profile = await AppDataSource.getRepository(Profile).save(
        AppDataSource.getRepository(Profile).create({
          userId: user.id,
          displayName: u.profile.displayName,
          intention: u.profile.intention,
          gender: u.profile.gender,
          seeking: u.profile.seeking,
          commune: u.profile.commune,
          communeInsee: (await city)?.insee ?? null,
          bio: u.profile.bio,
          completedAt: new Date(),
        }),
      );
      for (let i = 0; i < u.colors.length; i++) {
        const photo = await makePhoto(user.id, u.colors[i]!, i + 1);
        photo.profileId = profile.id;
        await AppDataSource.getRepository(Photo).save(photo);
      }
      created++;
      console.log(`[seed] créé : ${u.email} (profil complet + ${u.colors.length} photos)`);
    }
    console.log(`[seed] terminé — ${created} créé(s). Mot de passe dev : ${DEV_PASSWORD}`);
  } finally {
    await AppDataSource.destroy();
  }
}

main().catch((err: unknown) => {
  console.error("[seed] échec:", err instanceof Error ? `${err.message}\n${err.stack ?? ""}` : err);
  process.exit(1);
});
