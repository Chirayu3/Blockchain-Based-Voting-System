import {
  BaseEntity,
  Column,
  Entity,
  Index,
  OneToMany,
  PrimaryGeneratedColumn,
} from "typeorm";
import { Transaction } from "./Transaction";
import { OtpChallenge } from "./OtpChallenge";
import { EmailDeliveryLog } from "./EmailDeliveryLog";
import type { BiometricCredential } from "./BiometricCredential";

export enum RegistrationStatus {
  PENDING_APPROVAL = "PENDING_APPROVAL",
  APPROVED = "APPROVED",
  REJECTED = "REJECTED",
}

@Entity()
export class User extends BaseEntity {
  @PrimaryGeneratedColumn()
  id!: number;

  @Index({ unique: true })
  @Column({ type: "varchar", length: 30, unique: true, nullable: true })
  voterId!: string | null;

  @Column({ length: 100 })
  name!: string;

  @Column({ unique: true })
  citizenshipNumber!: string;

  @Column({ length: 180, unique: true })
  email!: string;

  @Column()
  password!: string;

  @Column()
  admin!: boolean;

  // Authoritative Registration Approval Field
  @Index()
  @Column({
    type: "varchar",
    length: 30,
    default: RegistrationStatus.PENDING_APPROVAL,
  })
  registrationStatus!: RegistrationStatus;

  @Index()
  @Column({ type: "datetime", nullable: true })
  registrationSubmittedAt!: Date | null;

  @Column({ type: "datetime", nullable: true })
  registrationReviewedAt!: Date | null;

  @Column({ type: "int", nullable: true })
  reviewedBy!: number | null;

  @Column({ type: "text", nullable: true })
  rejectionReason!: string | null;

  // Legacy Administrator Verification (managed exclusively in Admin Portal)
  @Column({ default: false })
  verified!: boolean;

  // Email Ownership Verification (verified via OTP)
  @Column({ default: false })
  emailVerified!: boolean;

  // Account Status (if false, account is blocked/deactivated)
  @Column({ default: true })
  isActive!: boolean;

  @OneToMany(() => Transaction, (transaction) => transaction.voter)
  transactions!: Transaction[];

  @OneToMany(() => OtpChallenge, (challenge) => challenge.user)
  otpChallenges!: OtpChallenge[];

  @OneToMany(() => EmailDeliveryLog, (log) => log.user)
  emailDeliveryLogs!: EmailDeliveryLog[];

  @OneToMany("BiometricCredential", (credential: any) => credential.user)
  biometricCredentials!: BiometricCredential[];
}
