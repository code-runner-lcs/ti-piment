import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from "typeorm";

export type ReportStatus = "pending" | "handled" | "dismissed";

@Entity("reports")
@Index("ix_reports_status", ["status", "createdAt"])
export class Report {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column("uuid", { name: "reporter_id" })
  reporterId!: string;

  @Column("uuid", { name: "target_profile_id" })
  targetProfileId!: string;

  @Column("varchar", { length: 24 })
  reason!: string;

  @Column("text", { nullable: true })
  detail!: string | null;

  @Column("varchar", { length: 16, default: "pending" })
  status!: ReportStatus;

  @Column("timestamptz", { name: "handled_at", nullable: true })
  handledAt!: Date | null;

  @Column("uuid", { name: "handled_by", nullable: true })
  handledBy!: string | null;

  @CreateDateColumn({ type: "timestamptz", name: "created_at" })
  createdAt!: Date;
}
