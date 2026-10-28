import type { MigrationInterface, QueryRunner } from "typeorm";

export class ProfilesPhotosPreferences1793222400000 implements MigrationInterface {
  name = "ProfilesPhotosPreferences1793222400000";

  async up(qr: QueryRunner): Promise<void> {
    await qr.query(`CREATE TABLE refresh_tokens (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id uuid NOT NULL,
      token_hash text NOT NULL,
      family_id uuid NOT NULL,
      expires_at timestamptz NOT NULL,
      revoked_at timestamptz,
      user_agent text,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )`);
    await qr.query(`CREATE INDEX ix_refresh_user ON refresh_tokens (user_id)`);
    await qr.query(`CREATE INDEX ix_refresh_family ON refresh_tokens (family_id)`);
    await qr.query(`CREATE UNIQUE INDEX ux_refresh_hash ON refresh_tokens (token_hash)`);

    await qr.query(`CREATE TABLE profiles (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id uuid NOT NULL UNIQUE,
      display_name varchar(20) NOT NULL,
      intention varchar(20) NOT NULL,
      gender varchar(16) NOT NULL,
      seeking varchar(10) NOT NULL,
      bio text,
      commune varchar(64),
      completed_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT ck_profiles_name_len CHECK (char_length(display_name) BETWEEN 2 AND 20),
      CONSTRAINT fk_profiles_user FOREIGN KEY (user_id) REFERENCES users (id)
    )`);

    await qr.query(`CREATE TABLE preferences (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      profile_id uuid NOT NULL UNIQUE,
      age_min integer NOT NULL DEFAULT 18,
      age_max integer NOT NULL DEFAULT 99,
      distance_km integer NOT NULL DEFAULT 50,
      intention varchar(20),
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT ck_prefs_ranges CHECK (age_min >= 18 AND age_max >= age_min AND distance_km BETWEEN 1 AND 160),
      CONSTRAINT fk_prefs_profile FOREIGN KEY (profile_id) REFERENCES profiles (id)
    )`);

    await qr.query(`CREATE TABLE photos (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id uuid NOT NULL,
      profile_id uuid NOT NULL,
      path_orig text NOT NULL,
      path_main text NOT NULL,
      path_thumb text NOT NULL,
      position integer NOT NULL,
      status varchar(16) NOT NULL DEFAULT 'pending',
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT fk_photos_user FOREIGN KEY (user_id) REFERENCES users (id),
      CONSTRAINT fk_photos_profile FOREIGN KEY (profile_id) REFERENCES profiles (id)
    )`);
    await qr.query(`CREATE INDEX ix_photos_user ON photos (user_id)`);
  }

  async down(qr: QueryRunner): Promise<void> {
    await qr.query(`DROP TABLE IF EXISTS photos`);
    await qr.query(`DROP TABLE IF EXISTS preferences`);
    await qr.query(`DROP TABLE IF EXISTS profiles`);
    await qr.query(`DROP TABLE IF EXISTS refresh_tokens`);
  }
}
