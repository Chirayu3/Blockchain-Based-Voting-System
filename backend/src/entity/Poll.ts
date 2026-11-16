import {
  BaseEntity,
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";
import { Candidate } from "./Candidate";
import { Transaction } from "./Transaction";

@Entity()
export class Poll extends BaseEntity {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column()
  name!: string;

  @Column({ type: "text", nullable: true })
  description!: string;

  @Column({ default: "running" })
  status!: string;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;

  @OneToMany(() => Candidate, (candidate) => candidate.poll)
  candidates!: Candidate[];

  @OneToMany(() => Transaction, (transaction) => transaction.election)
  transactions!: Transaction[];
}
