import { hash } from "@node-rs/argon2";
import type { LoginInput, RegisterInput, SessionUser } from "@tipiment/shared";
import { AppDataSource } from "../data-source";
import { AppError } from "../http/app-error";
import { User } from "../entities/user.entity";
import { signAccessToken } from "../auth/jwt";
import { enforceMaxSessions, issueFamily } from "../auth/refresh";

const MIN_AGE = 18;

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
  const email = input.email.trim().toLowerCase();
  const repo = AppDataSource.getRepository(User);

  const existing = await repo.findOne({ where: { email } });
  if (existing) {
    throw new AppError(409, "EMAIL_TAKEN", "Un compte existe déjà avec cet email.");
  }

  const passwordHash = await hash(input.password, { memoryCost: 19456, timeCost: 2, parallelism: 1 });
  const user = repo.create({ email, passwordHash, birthDate: input.birthDate, lastActiveAt: new Date() });
  try {
    await repo.save(user);
  } catch (err) {
    if ((err as { code?: string }).code === "23505") {
      throw new AppError(409, "EMAIL_TAKEN", "Un compte existe déjà avec cet email.");
    }
    throw err;
  }
  return user.toSessionUser();
}

/** Connexion → access token + cookie refresh (rotation) + plafond 5 sessions. */
export async function login(input: LoginInput): Promise<{ accessToken: string; user: SessionUser; refreshPlain: string }> {
  const email = input.email.trim().toLowerCase();
  const repo = AppDataSource.getRepository(User);
  const user = await repo.findOne({ where: { email } });
  const { verify } = await import("@node-rs/argon2");
  if (!user || user.passwordHash === "!" || !(await verify(user.passwordHash, input.password))) {
    // Message générique unique : anti-énumération (CDC §4.3)
    throw new AppError(401, "INVALID_CREDENTIALS", "Identifiants invalides.");
  }
  user.lastActiveAt = new Date();
  await repo.save(user);
  await enforceMaxSessions(user.id);
  const { plain } = await issueFamily(user.id, undefined);
  return {
    accessToken: await signAccessToken(user.toSessionUser()),
    user: user.toSessionUser(),
    refreshPlain: plain,
  };
}
