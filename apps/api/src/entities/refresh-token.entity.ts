import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from "typeorm";
import { User } from "./user.entity";

@Entity("refresh_tokens")
@Index("ix_refresh_family", ["familyId"])
export class RefreshToken {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column("uuid", { name: "user_id" })
  userId!: string;

  @Index("ix_refresh_user")
  @ManyToOne(() => User, { onDelete: "NO ACTION" })
  @JoinColumn({ name: "user_id" })
  user!: User;

  /** sha256 du token brut — never store the raw refresh token */
  @Column("text", { name: "token_hash" })
  @Index("ux_refresh_hash", { unique: true })
  tokenHash!: string;

  @Column("uuid", { name: "family_id" })
  familyId!: string;

  @Column("timestamptz", { name: "expires_at" })
  expiresAt!: Date;

  @Column("timestamptz", { name: "revoked_at", nullable: true })
  revokedAt!: Date | null;

  @Column("text", { name: "user_agent", nullable: true })
  userAgent!: string | null;

  @CreateDateColumn({ type: "timestamptz", name: "created_at" })
  createdAt!: Date;

  @UpdateDateColumn({ type: "timestamptz", name: "updated_at" })
  updatedAt!: Date;
}
