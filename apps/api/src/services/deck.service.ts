import type { CardDto } from "@tipiment/shared";
import { AppDataSource } from "../data-source";

export interface DeckParams {
  myUserId: string;
  myProfileId: string;
  myGender: string;
  mySeeking: string;
  myAge: number;
  myIntentionPref: string | null;
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
}

/**
 * Deck pré-calculé 100 % serveur (CDC §F2/F3). Le client n'affiche que.
 * Score §8 (distance reportée au jalon géo) ; le bonus super-like +15 s'applique
 * quand C'EST EUX qui m'en ont envoyé un récent (F3 : l'auteur passe en tête).
 */
export async function getDeck(p: DeckParams): Promise<CardDto[]> {
  const rows = (await AppDataSource.query(
    `SELECT
       p.id AS profile_id, u.id AS user_id, p.display_name, COALESCE(p.commune,'') AS commune,
       p.intention, p.bio,
       date_part('year', age(now(), u.birth_date))::int AS age,
       f.path_main AS main_url, f.path_thumb AS thumb_url,
       EXISTS (
         SELECT 1 FROM swipes sw
         JOIN profiles sp ON sp.id = sw.swiper_profile_id
         WHERE sp.user_id = u.id
           AND sw.target_user_id = $1 AND sw.action = 'superlike'
           AND sw.created_at > now() - interval '7 days'
       ) AS superliked_me,
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
     WHERE u.id <> $1
       AND u.email_verified = true
       AND u.role = 'user'
       AND u.password_hash <> '!'
       AND u.birth_date IS NOT NULL
       AND p.completed_at IS NOT NULL
       AND ph.approved_count > 0
       AND ($5 = 'tous' OR p.gender = $5::text)
       AND (p.seeking = 'tous' OR p.seeking = $6::text)
       AND COALESCE(tp.age_min, 18) <= $2
       AND COALESCE(tp.age_max, 99) >= $2
       AND $3 <= date_part('year', age(now(), u.birth_date))::int
       AND $4 >= date_part('year', age(now(), u.birth_date))::int
       AND ($7::varchar IS NULL OR $7::varchar = p.intention)
       AND (tp.intention IS NULL OR tp.intention = $8::varchar)
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
     ORDER BY score DESC, right(md5(p.id::text || $10), 3) ASC
     LIMIT 20`,
    [
      p.myUserId, // $1
      p.myAge, // $2 : filtré par la fenêtre d'âge de CHACUN
      p.myAge, // $3 : mon âge >= leur age_min
      p.myAge, // $4 : mon âge <= leur age_max
      p.mySeeking, // $5
      p.myGender, // $6
      p.myIntentionPref, // $7
      p.myIntentionPref, // $8
      p.myProfileId, // $9
      p.salt, // $10
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
    }));
}
