import { Check, Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from "typeorm";

export const INTENTIONS = ["relation_serieuse", "sortir_decouvrir", "a_voir"] as const;
export const GENDERS = ["femme", "homme", "non_binaire", "autre"] as const;
export const SEEKING = ["femme", "homme", "tous"] as const;

@Entity("profiles")
@Check(`char_length(display_name) BETWEEN 2 AND 20`)
export class Profile {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column("uuid", { name: "user_id", unique: true })
  userId!: string;

  @Column("varchar", { name: "display_name", length: 20 })
  displayName!: string;

  @Column("varchar", { length: 20 })
  intention!: (typeof INTENTIONS)[number];

  @Column("varchar", { length: 16 })
  gender!: (typeof GENDERS)[number];

  @Column("varchar", { length: 10 })
  seeking!: (typeof SEEKING)[number];

  @Column("text", { nullable: true })
  bio!: string | null;

  @Column("varchar", { length: 64, nullable: true })
  commune!: string | null;

  @Column("timestamptz", { name: "completed_at", nullable: true })
  completedAt!: Date | null;

  @CreateDateColumn({ type: "timestamptz", name: "created_at" })
  createdAt!: Date;

  @UpdateDateColumn({ type: "timestamptz", name: "updated_at" })
  updatedAt!: Date;
}
