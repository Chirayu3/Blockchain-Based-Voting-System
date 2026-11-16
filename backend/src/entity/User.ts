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

@Entity()
export class User extends BaseEntity {
  @PrimaryGeneratedColumn()
  id!: number;

  @Index({ unique: true })
  @Column({ type: "varchar", length: 30, unique: true })
  voterId!: string;

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
}
