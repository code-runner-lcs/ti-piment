import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from "typeorm";

@Entity("messages")
@Index("ix_messages_match", ["matchId", "createdAt"])
export class Message {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column("uuid", { name: "match_id" })
  matchId!: string;

  @Column("uuid", { name: "sender_id" })
  senderId!: string;

  @Column("text")
  body!: string;

  /** Idempotence : un uuid client = un message, même en double envoi (CDC §F4) */
  @Column("uuid", { name: "client_uuid" })
  clientUuid!: string;

  @Column("timestamptz", { name: "delivered_at", nullable: true })
  deliveredAt!: Date | null;

  @CreateDateColumn({ type: "timestamptz", name: "created_at" })
  createdAt!: Date;
}
