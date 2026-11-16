import {
  BaseEntity,
  Column,
  Entity,
  ManyToOne,
  PrimaryGeneratedColumn,
} from "typeorm";
import { Poll } from "./Poll";

@Entity()
export class Candidate extends BaseEntity {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column()
  name!: string;

  @Column({ type: "text", nullable: true })
  info!: string;

  @ManyToOne(() => Poll, (poll) => poll.candidates, { onDelete: "CASCADE" })
  poll!: Poll;
}
