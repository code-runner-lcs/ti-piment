import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from "typeorm";

export type SwipeAction = "pass" | "like" | "superlike";

@Entity("swipes")
@Index("ux_swipes_pair", ["swiperProfileId", "targetProfileId"], { unique: true })
export class Swipe {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column("uuid", { name: "swiper_profile_id" })
  swiperProfileId!: string;

  @Column("uuid", { name: "target_profile_id" })
  @Index("ix_swipes_target")
  targetProfileId!: string;

  @Column("varchar", { length: 12 })
  action!: SwipeAction;

  /** Défini pour like/superlike — sert à détecter la réciprocité (CDC §F3) */
  @Column("uuid", { name: "swiper_user_id" })
  swiperUserId!: string;

  @Column("uuid", { name: "target_user_id" })
  targetUserId!: string;

  @CreateDateColumn({ type: "timestamptz", name: "created_at" })
  createdAt!: Date;
}
