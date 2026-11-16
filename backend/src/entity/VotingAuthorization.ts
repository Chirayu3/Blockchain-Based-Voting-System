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
import { Poll } from "./Poll";

export type VotingAuthorizationStatus =
  | "issued"
  | "processing"
  | "consumed"
  | "failed"
  | "indeterminate"
  | "expired";

@Entity()
export class VotingAuthorization extends BaseEntity {
  @PrimaryGeneratedColumn()
  id!: number;

  @Index({ unique: true })
  @Column({ type: "varchar", length: 64, unique: true })
  authorizationTokenHash!: string;

  @Index()
  @Column()
  userId!: number;

  @ManyToOne(() => User, { onDelete: "CASCADE" })
  @JoinColumn({ name: "userId" })
  user!: User;

  @Index()
  @Column()
  electionId!: number;

  @ManyToOne(() => Poll, { onDelete: "CASCADE" })
  @JoinColumn({ name: "electionId" })
  election!: Poll;

  @Column({ type: "varchar", length: 36 })
  verificationId!: string;

  @Column({
    type: "varchar",
    length: 20,
    default: "issued",
  })
  status!: VotingAuthorizationStatus;

  @Index()
  @Column({ type: "datetime" })
  expiresAt!: Date;

  @Column({ type: "datetime", nullable: true })
  consumedAt!: Date | null;

  @Column({ type: "varchar", length: 66, nullable: true })
  transactionHash!: string | null;

  @CreateDateColumn()
  createdAt!: Date;
}
