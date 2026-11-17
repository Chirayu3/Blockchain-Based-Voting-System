import {
  BaseEntity,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";
import { User } from "./User";

export type BiometricStatus = "active" | "revoked";

@Entity()
export class BiometricCredential extends BaseEntity {
  @PrimaryGeneratedColumn()
  id!: number;

  @Index({ unique: true })
  @Column({ unique: true })
  userId!: number;

  @ManyToOne(() => User, (user) => user.biometricCredentials, {
    onDelete: "CASCADE",
  })
  @JoinColumn({ name: "userId" })
  user!: User;

  // Authenticated ciphertext storing IV, auth tag, and encrypted embedding JSON
  @Column({ type: "text" })
  encryptedEmbedding!: string;

  @Column({ default: 1 })
  encryptionKeyVersion!: number;

  @Column({ length: 60 })
  modelIdentifier!: string;

  @Column({ length: 30 })
  modelVersion!: string;

  @Column({ default: 128 })
  embeddingDimension!: number;

  @Column({ type: "varchar", length: 20, default: "active" })
  status!: BiometricStatus;

  @CreateDateColumn()
  enrolledAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;

  @Column({ type: "datetime", nullable: true })
  lastVerifiedAt!: Date | null;
}
