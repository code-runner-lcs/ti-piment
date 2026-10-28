import type { CardDto } from "@tipiment/shared";
import { AppDataSource } from "../data-source";

export interface DeckParams {
  myUserId: string;
  myProfileId: string;
  myGender: string;
  mySeeking: string;
  myAge: number;
  myAgeMin: number;
  myAgeMax: number;
  myIntentionPref: string | null;
  myInsee: string | null;
  radiusKm: number | null;
  salt: string;
}

interface DeckRow {
  profile_id: string;
  user_id: string;
  display_name: string;
  commune: string | null;
  intention: string;
  bio: string | null;
  age: string | number;
  main_url: string | null;
  thumb_url: string | null;
  superliked_me: boolean;
  score: string | number;
  distance_km: string | number | null;
}

/** Haversine auto-équilibrée (4 ouvre / 4 ferme) : ROUND(${HAV} / 5) * 5, WHEN ${HAV} <= 30 … */
const HAV = `(6371 * acos(LEAST(1, GREATEST(-1,
           sin(radians(mc.lat)) * sin(radians(tc.lat)) +
           cos(radians(mc.lat)) * cos(radians(tc.lat)) *
           cos(radians(tc.lng) - radians(mc.lng))))))`;

/**
 * Deck pré-calculé 100 % serveur (CDC §F2/F3). Score §8 : fraîcheur, photos, inactivité,
 * super-like REÇU (+15), boost <72 h, distance km via centroïdes INSEE
 * (buckets ≤10→0 · ≤30→5 · ≤60→10 · ≤160→20 ; insee inconnu → distance null, pénalité 0).
 */
export async function getDeck(p: DeckParams): Promise<CardDto[]> {
  const rows = (await AppDataSource.query(
    `WITH cand AS (
       SELECT
         p.id AS profile_id, u.id AS user_id, p.display_name, COALESCE(p.commune,'') AS commune,
         p.intention, p.bio,
         date_part('year', age(now(), u.birth_date))::int AS age,
         f.path_main AS main_url, f.path_thumb AS thumb_url,
         EXISTS (
           SELECT 1 FROM swipes sw
           JOIN profiles sp ON sp.id = sw.swiper_profile_id
           WHERE sp.user_id = u.id AND sw.target_user_id = $1 AND sw.action = 'superlike'
             AND sw.created_at > now() - interval '7 days'
         ) AS superliked_me,
         CASE
           WHEN mc.insee IS NOT NULL AND tc.insee IS NOT NULL
             THEN ROUND(${HAV} / 5) * 5
           ELSE NULL
         END AS distance_km,
         CASE WHEN mc.insee IS NULL OR tc.insee IS NULL THEN 0
           WHEN ${HAV} <= 10 THEN 0
           WHEN ${HAV} <= 30 THEN 5
           WHEN ${HAV} <= 60 THEN 10
           ELSE 20
         END AS dist_penalty,
         (
           100
           - CASE WHEN COALESCE(u.last_active_at, u.created_at) < now() - interval '14 days' THEN 30 ELSE 0 END
           + CASE WHEN ph.approved_count >= 2 THEN 20 ELSE 0 END
           + CASE WHEN (SELECT min(ph3.created_at) FROM photos ph3 WHERE ph3.profile_id = p.id AND ph3.status='approved') > now() - interval '7 days' THEN 10 ELSE 0 END
           + CASE WHEN EXISTS (
               SELECT 1 FROM swipes sw2
               JOIN profiles sp2 ON sp2.id = sw2.swiper_profile_id
               WHERE sp2.user_id = u.id AND sw2.target_user_id = $1 AND sw2.action = 'superlike'
                 AND sw2.created_at > now() - interval '7 days'
             ) THEN 15 ELSE 0 END
         ) * CASE WHEN p.created_at > now() - interval '72 hours' THEN 1.5 ELSE 1 END AS score
       FROM profiles p
       JOIN users u ON u.id = p.user_id
       LEFT JOIN preferences tp ON tp.profile_id = p.id
       LEFT JOIN LATERAL (
         SELECT path_main, path_thumb FROM photos phf
         WHERE phf.profile_id = p.id AND phf.status = 'approved'
         ORDER BY phf.position ASC LIMIT 1
       ) f ON true
       LEFT JOIN LATERAL (
         SELECT count(*) AS approved_count FROM photos phc
         WHERE phc.profile_id = p.id AND phc.status='approved'
       ) ph ON true
       LEFT JOIN cities mc ON mc.insee = $11::varchar
       LEFT JOIN cities tc ON tc.insee = p.commune_insee
       WHERE u.id <> $1
         AND u.email_verified = true
         AND u.role = 'user'
         AND u.password_hash <> '!'
         AND u.birth_date IS NOT NULL
         AND p.completed_at IS NOT NULL
         AND ph.approved_count > 0
         AND ($6 = 'tous' OR p.gender = $6::text)
         AND (p.seeking = 'tous' OR p.seeking = $7::text)
         AND COALESCE(tp.age_min, 18) <= $2
         AND COALESCE(tp.age_max, 99) >= $2
         AND $3 <= date_part('year', age(now(), u.birth_date))::int
         AND $4 >= date_part('year', age(now(), u.birth_date))::int
         AND ($8::varchar IS NULL OR $8::varchar = p.intention)
         AND (tp.intention IS NULL OR tp.intention = $5::varchar)
         AND NOT EXISTS (
           SELECT 1 FROM swipes s WHERE s.swiper_profile_id = $9 AND s.target_profile_id = p.id
             AND s.created_at > now() - interval '30 days'
         )
         AND NOT EXISTS (
           SELECT 1 FROM blocks b
           WHERE (b.blocker_user_id = $1 AND b.blocked_user_id = u.id)
              OR (b.blocker_user_id = u.id AND b.blocked_user_id = $1)
         )
         AND NOT EXISTS (
           SELECT 1 FROM matches m
           WHERE (m.user_a_id = $1 AND m.user_b_id = u.id) OR (m.user_a_id = u.id AND m.user_b_id = $1)
         )
     )
     SELECT * FROM cand
     WHERE ($12::int IS NULL OR distance_km IS NULL OR distance_km <= $12::int)
     ORDER BY (score - dist_penalty) DESC, right(md5(profile_id::text || $10), 3) ASC
     LIMIT 20`,
    [
      p.myUserId,      // $1
      p.myAge,         // $2 : mon âge dans la fenêtre de CHACUN (tp)
      p.myAgeMin,      // $3 : fenêtre d'AUSSI bornant leur âge
      p.myAgeMax,      // $4
      p.myIntentionPref, // $5
      p.mySeeking,     // $6
      p.myGender,      // $7
      p.myIntentionPref, // $8
      p.myProfileId,   // $9
      p.salt,          // $10
      p.myInsee,       // $11 : JOIN cities pour la distance
      p.radiusKm,      // $12 : rayon du demandeur
    ],
  )) as unknown as DeckRow[];

  return rows
    .filter((r) => r.main_url !== null)
    .map((r) => ({
      profileId: r.profile_id,
      userId: r.user_id,
      displayName: r.display_name,
      age: Number(r.age),
      commune: r.commune ?? "",
      intention: r.intention,
      bio: r.bio,
      mainUrl: `/uploads/${r.main_url}`,
      thumbUrl: `/uploads/${r.thumb_url}`,
      superlikedMe: Boolean(r.superliked_me),
      distanceKm: r.distance_km === null ? null : Number(r.distance_km),
    }));
}
