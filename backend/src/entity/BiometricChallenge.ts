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

export type BiometricChallengeType = "enrollment" | "voting";

@Entity()
export class BiometricChallenge extends BaseEntity {
  @PrimaryGeneratedColumn()
  id!: number;

  @Index({ unique: true })
  @Column({ type: "varchar", length: 36, unique: true })
  challengeId!: string;

  @Index()
  @Column()
  userId!: number;

  @ManyToOne(() => User, { onDelete: "CASCADE" })
  @JoinColumn({ name: "userId" })
  user!: User;

  @Index()
  @Column({ nullable: true })
  electionId!: number;

  @Column({ type: "varchar", length: 30 })
  challengeType!: BiometricChallengeType;

  @Column({ type: "varchar", length: 64 })
  challengeNonceHash!: string;

  // JSON-encoded sequence of required liveness actions (e.g. ["look_center", "turn_left"])
  @Column({ type: "text" })
  challengeInstructions!: string;

  @Index()
  @Column({ type: "datetime" })
  expiresAt!: Date;

  @Column({ type: "datetime", nullable: true })
  consumedAt!: Date | null;

  @Column({ type: "varchar", length: 45, nullable: true })
  ipAddress!: string | null;

  @CreateDateColumn()
  createdAt!: Date;
}
