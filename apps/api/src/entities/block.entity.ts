import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from "typeorm";

/** Blocage instantané et silencieux (F5) — la table existe dès M2 pour exclure des decks. */
@Entity("blocks")
@Index("ux_blocks_pair", ["blockerUserId", "blockedUserId"], { unique: true })
export class Block {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column("uuid", { name: "blocker_user_id" })
  blockerUserId!: string;

  @Column("uuid", { name: "blocked_user_id" })
  blockedUserId!: string;

  @CreateDateColumn({ type: "timestamptz", name: "created_at" })
  createdAt!: Date;
}
