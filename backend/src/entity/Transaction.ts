import {
  BaseEntity,
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from "typeorm";
import { User } from "./User";
import { Poll } from "./Poll";

@Entity()
export class Transaction extends BaseEntity {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ unique: true })
  transactionHash!: string;

  @Column()
  voterId!: number;

  @ManyToOne(() => User, (user) => user.transactions, { onDelete: "CASCADE" })
  @JoinColumn({ name: "voterId" })
  voter!: User;

  @Column({ nullable: true })
  electionId!: number;

  @ManyToOne(() => Poll, (poll) => poll.transactions, { onDelete: "SET NULL" })
  @JoinColumn({ name: "electionId" })
  election!: Poll;

  @Column()
  candidateName!: string;

  @Column()
  blockNumber!: number;

  @Column({ type: "datetime" })
  timestamp!: Date;

  @Column()
  gasUsed!: number;

  @Column({ default: "success" })
  status!: string;

  @CreateDateColumn()
  createdAt!: Date;
}
