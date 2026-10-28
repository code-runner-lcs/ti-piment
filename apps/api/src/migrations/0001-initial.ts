import type { MigrationInterface, QueryRunner } from "typeorm";

export class InitialMigration1793145600000 implements MigrationInterface {
  name = "InitialMigration1793145600000";

  async up(qr: QueryRunner): Promise<void> {
    await qr.query(`CREATE TABLE users (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      email text NOT NULL,
      password_hash text NOT NULL,
      role varchar(16) NOT NULL DEFAULT 'user',
      email_verified boolean NOT NULL DEFAULT false,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )`);
    await qr.query(`CREATE UNIQUE INDEX ux_users_email_lower ON users (lower(email))`);
  }

  async down(qr: QueryRunner): Promise<void> {
    await qr.query(`DROP INDEX IF EXISTS ux_users_email_lower`);
    await qr.query(`DROP TABLE IF EXISTS users`);
  }
}
