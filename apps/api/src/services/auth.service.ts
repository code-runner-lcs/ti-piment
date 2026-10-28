import { hash, verify } from "@node-rs/argon2";
import type { LoginInput, RegisterInput, SessionUser } from "@tipiment/shared";
import { AppDataSource } from "../data-source";
import { AppError } from "../http/app-error";
import { User } from "../entities/user.entity";
import { signAccessToken } from "../auth/jwt";

const MIN_AGE = 18; // CDC §4.1 : contrôle serveur strict

function ageFromBirthDate(birthDate: string): number {
  const birth = new Date(`${birthDate}T00:00:00Z`);
  const now = new Date();
  let age = now.getUTCFullYear() - birth.getUTCFullYear();
  const months = now.getUTCMonth() - birth.getUTCMonth();
  if (months < 0 || (months === 0 && now.getUTCDate() < birth.getUTCDate())) age--;
  return age;
}

export async function register(input: RegisterInput): Promise<SessionUser> {
  if (ageFromBirthDate(input.birthDate) < MIN_AGE) {
    throw new AppError(422, "AGE_BELOW_MINIMUM", "TiPiment est réservée aux 18 ans et plus.");
  }
  const email = input.email.trim().toLowerCase(); // 1 email = 1 compte, normalisation (CDC §4.1)
  const repo = AppDataSource.getRepository(User);

  const existing = await repo.findOne({ where: { email } });
  if (existing) {
    throw new AppError(409, "EMAIL_TAKEN", "Un compte existe déjà avec cet email.");
  }

  const passwordHash = await hash(input.password, { memoryCost: 19456, timeCost: 2, parallelism: 1 });
  const user = repo.create({ email, passwordHash });
  try {
    // save (et non insert) : TypeORM remplit l'id généré sur l'entité
    await repo.save(user);
  } catch (err) {
    if ((err as { code?: string }).code === "23505") {
      throw new AppError(409, "EMAIL_TAKEN", "Un compte existe déjà avec cet email.");
    }
    throw err;
  }
  return user.toSessionUser();
  // Note M1 : un email de vérification partirait ici ; le profil reste non publié tant que
  // email_verified=false (décision tranchée CDC V1.1 §4.1).
}

export async function login(input: LoginInput): Promise<{ accessToken: string; user: SessionUser }> {
  const email = input.email.trim().toLowerCase();
  const user = await AppDataSource.getRepository(User).findOne({ where: { email } });
  if (!user || !(await verify(user.passwordHash, input.password))) {
    // Message générique unique : anti-énumération (CDC §4.3)
    throw new AppError(401, "INVALID_CREDENTIALS", "Identifiants invalides.");
  }
  return { accessToken: await signAccessToken(user.toSessionUser()), user: user.toSessionUser() };
}
