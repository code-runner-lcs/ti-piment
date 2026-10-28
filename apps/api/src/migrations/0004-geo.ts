import type { MigrationInterface, QueryRunner } from "typeorm";

export class GeoCities1793404800000 implements MigrationInterface {
  name = "GeoCities1793404800000";

  async up(qr: QueryRunner): Promise<void> {
    await qr.query(`CREATE TABLE cities (
      insee varchar(8) PRIMARY KEY,
      name varchar(64) NOT NULL,
      dept_code varchar(4) NOT NULL,
      dept_name varchar(64) NOT NULL,
      lat double precision NOT NULL,
      lng double precision NOT NULL
    )`);
    await qr.query(`CREATE INDEX ix_cities_name ON cities (name)`);
    await qr.query(`ALTER TABLE profiles ADD COLUMN IF NOT EXISTS commune_insee varchar(8)`);
    await qr.query(`ALTER TABLE profiles ADD CONSTRAINT fk_profiles_commune
      FOREIGN KEY (commune_insee) REFERENCES cities (insee) ON DELETE SET NULL`);
  }

  async down(qr: QueryRunner): Promise<void> {
    await qr.query(`ALTER TABLE profiles DROP CONSTRAINT IF EXISTS fk_profiles_commune`);
    await qr.query(`ALTER TABLE profiles DROP COLUMN IF EXISTS commune_insee`);
    await qr.query(`DROP TABLE IF EXISTS cities`);
  }
}
