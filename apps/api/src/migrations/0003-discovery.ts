import type { MigrationInterface, QueryRunner } from "typeorm";

export class SwipesMatchesBlocks1793318400000 implements MigrationInterface {
  name = "SwipesMatchesBlocks1793318400000";

  async up(qr: QueryRunner): Promise<void> {
    await qr.query(`ALTER TABLE users
      ADD COLUMN IF NOT EXISTS birth_date date,
      ADD COLUMN IF NOT EXISTS last_active_at timestamptz`);

    await qr.query(`CREATE TABLE swipes (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      swiper_profile_id uuid NOT NULL REFERENCES profiles (id),
      target_profile_id uuid NOT NULL REFERENCES profiles (id),
      action varchar(12) NOT NULL,
      swiper_user_id uuid NOT NULL,
      target_user_id uuid NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT ck_swipes_action CHECK (action IN ('pass','like','superlike'))
    )`);
    await qr.query(`CREATE UNIQUE INDEX ux_swipes_pair ON swipes (swiper_profile_id, target_profile_id)`);
    await qr.query(`CREATE INDEX ix_swipes_target ON swipes (target_profile_id)`);

    await qr.query(`CREATE TABLE matches (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_a_id uuid NOT NULL,
      user_b_id uuid NOT NULL,
      last_message_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT ck_matches_distinct CHECK (user_a_id <> user_b_id)
    )`);
    await qr.query(`CREATE UNIQUE INDEX ux_matches_pair ON matches (user_a_id, user_b_id)`);
    await qr.query(`CREATE INDEX ix_matches_b ON matches (user_b_id)`);

    await qr.query(`CREATE TABLE blocks (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      blocker_user_id uuid NOT NULL,
      blocked_user_id uuid NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT ck_blocks_distinct CHECK (blocker_user_id <> blocked_user_id)
    )`);
    await qr.query(`CREATE UNIQUE INDEX ux_blocks_pair ON blocks (blocker_user_id, blocked_user_id)`);
  }

  async down(qr: QueryRunner): Promise<void> {
    await qr.query(`DROP TABLE IF EXISTS blocks`);
    await qr.query(`DROP INDEX IF EXISTS ix_matches_b`);
    await qr.query(`DROP TABLE IF EXISTS matches`);
    await qr.query(`DROP INDEX IF EXISTS ix_swipes_target`);
    await qr.query(`DROP INDEX IF EXISTS ux_swipes_pair`);
    await qr.query(`DROP TABLE IF EXISTS swipes`);
    await qr.query(`ALTER TABLE users DROP COLUMN IF EXISTS last_active_at`);
    await qr.query(`ALTER TABLE users DROP COLUMN IF EXISTS birth_date`);
  }
}
