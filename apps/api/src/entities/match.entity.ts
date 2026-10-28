import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from "typeorm";

@Entity("matches")
@Index("ux_matches_pair", ["userAId", "userBId"], { unique: true })
export class Match {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  /** Le plus petit uuid des deux membres (paire stable) */
  @Column("uuid", { name: "user_a_id" })
  userAId!: string;

  @Column("uuid", { name: "user_b_id" })
  userBId!: string;

  @CreateDateColumn({ type: "timestamptz", name: "created_at" })
  createdAt!: Date;

  @Column("timestamptz", { name: "last_message_at", nullable: true })
  lastMessageAt!: Date | null;

  @UpdateDateColumn({ type: "timestamptz", name: "updated_at" })
  updatedAt!: Date;
}
