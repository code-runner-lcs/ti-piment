import { promises as fs } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { IsNull } from "typeorm";
import type { PreferencesInput, ProfileInput, SessionUser } from "@tipiment/shared";
import { AppDataSource } from "../data-source";
import { AppError } from "../http/app-error";
import { config } from "../config";
import { Photo, type PhotoStatus } from "../entities/photo.entity";
import { Preference } from "../entities/preference.entity";
import { Profile } from "../entities/profile.entity";
import { RefreshToken } from "../entities/refresh-token.entity";
import { User } from "../entities/user.entity";

const PROFILE_REPO = () => AppDataSource.getRepository(Profile);
const PREFS_REPO = () => AppDataSource.getRepository(Preference);
const PHOTO_REPO = () => AppDataSource.getRepository(Photo);

function urlFor(p: Photo): { url: string; thumbUrl: string } {
  return { url: `/uploads/${p.pathMain}`, thumbUrl: `/uploads/${p.pathThumb}` };
}

export function photoToDto(p: Photo) {
  return { id: p.id, url: urlFor(p).url, thumbUrl: urlFor(p).thumbUrl, status: p.status, position: p.position };
}

export async function getProfileBundle(userId: string) {
  const profile = await PROFILE_REPO().findOne({ where: { userId } });
  const preferences = profile ? await PREFS_REPO().findOne({ where: { profileId: profile.id } }) : null;
  const photos = profile ? await PHOTO_REPO().find({ where: { profileId: profile.id }, order: { position: "ASC" } }) : [];
  const completed = Boolean(
    profile &&
    profile.displayName && profile.intention && profile.gender && profile.seeking && profile.commune &&
    photos.some((ph) => ph.status === "approved"),
  );
  return { profile, preferences, photos, completed };
}

export async function upsertProfile(userId: string, input: ProfileInput): Promise<Profile> {
  let profile = await PROFILE_REPO().findOne({ where: { userId } });
  if (!profile) {
    profile = PROFILE_REPO().create({ userId, ...input, completedAt: null });
    return PROFILE_REPO().save(profile);
  }
  Object.assign(profile, input);
  await recomputeCompletion(userId);
  return PROFILE_REPO().save(profile);
}

export async function upsertPreferences(userId: string, input: PreferencesInput): Promise<Preference> {
  const profile = await PROFILE_REPO().findOne({ where: { userId } });
  if (!profile) throw AppError.badRequest("Crée d'abord ton profil.", "PROFILE_REQUIRED");
  let prefs = await PREFS_REPO().findOne({ where: { profileId: profile.id } });
  if (!prefs) {
    prefs = PREFS_REPO().create({ profileId: profile.id, ...input });
  } else {
    Object.assign(prefs, input);
  }
  return PREFS_REPO().save(prefs);
}

export async function recomputeCompletion(userId: string): Promise<void> {
  const { profile, completed } = await getProfileBundle(userId);
  if (!profile) return;
  profile.completedAt = completed ? (profile.completedAt ?? new Date()) : null;
  await PROFILE_REPO().save(profile);
}

export function sniffImage(buf: Buffer): "jpeg" | "png" | "webp" | null {
  if (buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "jpeg";
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return "png";
  if (buf.subarray(0, 4).toString("ascii") === "RIFF" && buf.subarray(8, 12).toString("ascii") === "WEBP") return "webp";
  return null;
}

export async function addPhoto(user: SessionUser, buf: Buffer): Promise<Photo> {
  if (buf.length > config.photos.maxBytes) {
    throw new AppError(413, "PHOTO_TOO_LARGE", "Photo trop lourde (8 Mo maximum).");
  }
  const kind = sniffImage(buf);
  if (!kind) {
    throw new AppError(415, "UNSUPPORTED_MEDIA", "Formats acceptés : JPEG, PNG, WebP (HEIC à convertir d'abord).");
  }
  const profile = await PROFILE_REPO().findOne({ where: { userId: user.id } });
  if (!profile) throw AppError.badRequest("Crée d'abord ton profil.", "PROFILE_REQUIRED");

  const count = await PHOTO_REPO().count({ where: { userId: user.id } });
  if (count >= config.photos.maxPerUser) {
    throw new AppError(409, "MAX_PHOTOS", "Maximum de photos atteint (6).");
  }

  // sharp : rotate respecte l'orientation EXIF, puis le ré-encodage PURGE toutes les métadonnées (GPS inclus)
  const base = sharp(buf, { failOn: "error" }).rotate();
  const dir = path.join(config.photos.uploadsDir, user.id);
  await fs.mkdir(dir, { recursive: true });
  const idOut = randomUUID();
  await fs.writeFile(path.join(dir, `${idOut}.webp`), await base.clone().webp({ quality: 92 }).toBuffer());
  await fs.writeFile(
    path.join(dir, `${idOut}-main.webp`),
    await base.clone().resize(1080, 1080, { fit: "inside", withoutEnlargement: true }).webp({ quality: 88 }).toBuffer(),
  );
  await fs.writeFile(
    path.join(dir, `${idOut}-thumb.webp`),
    await base.clone().resize(480, 480, { fit: "inside", withoutEnlargement: true }).webp({ quality: 82 }).toBuffer(),
  );

  const status: PhotoStatus = config.photos.autoApprove ? "approved" : "pending";
  const photo = PHOTO_REPO().create({
    userId: user.id,
    profileId: profile.id,
    pathOrig: `${user.id}/${idOut}.webp`,
    pathMain: `${user.id}/${idOut}-main.webp`,
    pathThumb: `${user.id}/${idOut}-thumb.webp`,
    position: count + 1,
    status,
  });
  await PHOTO_REPO().save(photo);
  await recomputeCompletion(user.id);
  return photo;
}

export async function deletePhoto(userId: string, photoId: string): Promise<void> {
  const photo = await PHOTO_REPO().findOne({ where: { id: photoId, userId } });
  if (!photo) throw new AppError(404, "NOT_FOUND", "Photo introuvable.");
  await PHOTO_REPO().delete(photo.id);
  for (const rel of [photo.pathOrig, photo.pathMain, photo.pathThumb]) {
    await fs.rm(path.join(config.photos.uploadsDir, rel), { force: true }).catch(() => undefined);
  }
  await recomputeCompletion(userId);
}

/** CDC §4.1 : anomalisation immédiate — purge complète des données personnelles à J+30 (job M4). */
export async function anonymiseAccount(user: SessionUser, _userAgent?: string): Promise<void> {
  const paths: string[] = [];
  await AppDataSource.transaction(async (em) => {
    const profile = await em.getRepository(Profile).findOne({ where: { userId: user.id } });
    if (profile) {
      const photos = await em.getRepository(Photo).find({ where: { profileId: profile.id } });
      paths.push(...photos.flatMap((ph) => [ph.pathOrig, ph.pathMain, ph.pathThumb]));
      await em.getRepository(Photo).delete({ profileId: profile.id });
      await em.getRepository(Preference).delete({ profileId: profile.id });
      await em.getRepository(Profile).delete(profile.id);
    }
    await em.getRepository(RefreshToken).update({ userId: user.id, revokedAt: IsNull() }, { revokedAt: new Date() });
    await em.getRepository(User).update(user.id, {
      email: `deleted:${user.id}@tipiment.invalid`,
      passwordHash: "!", // argon2.refuse jamais ce hash
      emailVerified: false,
      role: "user",
    });
  });
  for (const rel of paths) {
    await fs.rm(path.join(config.photos.uploadsDir, rel), { force: true }).catch(() => undefined);
  }
}
