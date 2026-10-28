import { Check, Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from "typeorm";

@Entity("preferences")
@Check("age_min >= 18 AND age_max >= age_min AND distance_km BETWEEN 1 AND 160")
export class Preference {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column("uuid", { name: "profile_id", unique: true })
  profileId!: string;

  @Column("integer", { name: "age_min", default: 18 })
  ageMin!: number;

  @Column("integer", { name: "age_max", default: 99 })
  ageMax!: number;

  @Column("integer", { name: "distance_km", default: 50 })
  distanceKm!: number;

  @Column("varchar", { length: 20, nullable: true })
  intention!: string | null;

  @CreateDateColumn({ type: "timestamptz", name: "created_at" })
  createdAt!: Date;

  @UpdateDateColumn({ type: "timestamptz", name: "updated_at" })
  updatedAt!: Date;
}
