import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from "typeorm";

export type PhotoStatus = "pending" | "approved" | "rejected";

@Entity("photos")
@Index("ix_photos_user", ["userId"])
export class Photo {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column("uuid", { name: "user_id" })
  userId!: string;

  @Column("uuid", { name: "profile_id" })
  profileId!: string;

  @Column("text", { name: "path_orig" })
  pathOrig!: string;

  @Column("text", { name: "path_main" })
  pathMain!: string;

  @Column("text", { name: "path_thumb" })
  pathThumb!: string;

  @Column("integer")
  position!: number;

  @Column("varchar", { length: 16, default: "pending" })
  status!: PhotoStatus;

  @CreateDateColumn({ type: "timestamptz", name: "created_at" })
  createdAt!: Date;

  @UpdateDateColumn({ type: "timestamptz", name: "updated_at" })
  updatedAt!: Date;
}
