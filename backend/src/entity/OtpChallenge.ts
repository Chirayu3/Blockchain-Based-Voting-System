import {
  BaseEntity,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from "typeorm";
import { User } from "./User";

@Entity("otp_challenge")
export class OtpChallenge extends BaseEntity {
  @PrimaryGeneratedColumn()
  id!: number;

  @Index({ unique: true })
  @Column({ type: "varchar", length: 255 })
  challengeId!: string;

  @Index()
  @Column()
  userId!: number;

  @ManyToOne(() => User, (user) => user.otpChallenges, { onDelete: "CASCADE" })
  @JoinColumn({ name: "userId" })
  user!: User;

  @Column({ type: "varchar", length: 64 })
  otpHash!: string;

  @Index()
  @Column({ type: "datetime" })
  expiresAt!: Date;

  @Column({ type: "int", default: 0 })
  attempts!: number;

  @Column({ type: "datetime", nullable: true })
  consumedAt!: Date | null;

  @Column({ type: "varchar", length: 45, nullable: true })
  ipAddress!: string | null;

  @CreateDateColumn({ type: "datetime", precision: 6 })
  createdAt!: Date;
}
