import type { MigrationInterface, QueryRunner } from "typeorm";

export class ChatModeration1793491200000 implements MigrationInterface {
  name = "ChatModeration1793491200000";

  async up(qr: QueryRunner): Promise<void> {
    await qr.query(`CREATE TABLE messages (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      match_id uuid NOT NULL REFERENCES matches (id),
      sender_id uuid NOT NULL,
      body text NOT NULL,
      client_uuid uuid NOT NULL,
      delivered_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT ck_messages_len CHECK (char_length(body) BETWEEN 1 AND 1000)
    )`);
    await qr.query(`CREATE INDEX ix_messages_match ON messages (match_id, created_at)`);
    await qr.query(`CREATE UNIQUE INDEX ux_messages_client ON messages (sender_id, client_uuid)`);

    await qr.query(`CREATE TABLE reports (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      reporter_id uuid NOT NULL,
      target_profile_id uuid NOT NULL REFERENCES profiles (id),
      reason varchar(24) NOT NULL,
      detail text,
      status varchar(16) NOT NULL DEFAULT 'pending',
      handled_at timestamptz,
      handled_by uuid,
      created_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT ck_reports_reason CHECK (reason IN ('faux_profil','contenu_inapproprie','harcelement','escroquerie','mineur','autre'))
    )`);
    await qr.query(`CREATE INDEX ix_reports_status ON reports (status, created_at)`);
  }

  async down(qr: QueryRunner): Promise<void> {
    await qr.query(`DROP TABLE IF EXISTS reports`);
    await qr.query(`DROP INDEX IF EXISTS ux_messages_client`);
    await qr.query(`DROP INDEX IF EXISTS ix_messages_match`);
    await qr.query(`DROP TABLE IF EXISTS messages`);
  }
}
