import {
  BaseEntity,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";
import { User } from "./User";

export enum EmailDeliveryStatus {
  PENDING = "PENDING",
  SENT = "SENT",
  FAILED = "FAILED",
}

export enum EmailType {
  REGISTRATION_ACKNOWLEDGEMENT = "REGISTRATION_ACKNOWLEDGEMENT",
  REGISTRATION_APPROVAL = "REGISTRATION_APPROVAL",
  REGISTRATION_REJECTION = "REGISTRATION_REJECTION",
  VOTER_ID_RESEND = "VOTER_ID_RESEND",
}

@Entity()
export class EmailDeliveryLog extends BaseEntity {
  @PrimaryGeneratedColumn()
  id!: number;

  @Index()
  @Column({ type: "int", nullable: true })
  userId!: number | null;

  @Index()
  @Column({ type: "varchar", length: 50 })
  emailType!: EmailType;

  @Column({ type: "varchar", length: 180 })
  recipientEmail!: string;

  @Column({ type: "varchar", length: 100 })
  recipientName!: string;

  @Index()
  @Column({
    type: "varchar",
    length: 20,
    default: EmailDeliveryStatus.PENDING,
  })
  status!: EmailDeliveryStatus;

  @Column({ type: "text", nullable: true })
  payload!: string | null;

  @Column({ type: "text", nullable: true })
  errorMessage!: string | null;

  @Column({ type: "int", default: 0 })
  attempts!: number;

  @Column({ type: "datetime", nullable: true })
  sentAt!: Date | null;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;

  @ManyToOne(() => User, (user) => user.emailDeliveryLogs, {
    nullable: true,
    onDelete: "SET NULL",
  })
  user!: User | null;
}
