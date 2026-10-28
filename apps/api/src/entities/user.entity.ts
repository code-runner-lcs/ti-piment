import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";
import type { SessionUser } from "@tipiment/shared";

@Entity("users")
export class User {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  /** Email normalisé lowercase à l'écriture ; unicité via index fonctionnel lower(email) (migration 0001) */
  @Column("text")
  email!: string;

  @Column("text", { name: "password_hash" })
  passwordHash!: string;

  @Column("varchar", { length: 16, default: "user" })
  role!: "user" | "admin";

  @Column("boolean", { name: "email_verified", default: false })
  emailVerified!: boolean;

  /** Stockée serveur UNIQUEMENT pour l'âge calculé — jamais renvoyée au client (CDC §F1) */
  @Column("date", { name: "birth_date", nullable: true })
  birthDate!: string | null;

  /** Mis à jour à chaque login/refresh — alimente le score « inactif > 14 jours » */
  @Column("timestamptz", { name: "last_active_at", nullable: true })
  lastActiveAt!: Date | null;

  @CreateDateColumn({ type: "timestamptz", name: "created_at" })
  createdAt!: Date;

  @UpdateDateColumn({ type: "timestamptz", name: "updated_at" })
  updatedAt!: Date;

  toSessionUser(): SessionUser {
    return { id: this.id, email: this.email, role: this.role, emailVerified: this.emailVerified };
  }
}
