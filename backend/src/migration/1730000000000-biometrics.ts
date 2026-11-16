import { MigrationInterface, QueryRunner } from "typeorm";

export class biometrics1730000000000 implements MigrationInterface {
  name = "biometrics1730000000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Create biometric_credential table
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS \`biometric_credential\` (
        \`id\` int NOT NULL AUTO_INCREMENT,
        \`userId\` int NOT NULL,
        \`encryptedEmbedding\` text NOT NULL,
        \`encryptionKeyVersion\` int NOT NULL DEFAULT 1,
        \`modelIdentifier\` varchar(60) NOT NULL,
        \`modelVersion\` varchar(30) NOT NULL,
        \`embeddingDimension\` int NOT NULL DEFAULT 128,
        \`status\` varchar(20) NOT NULL DEFAULT 'active',
        \`enrolledAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        \`updatedAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        \`lastVerifiedAt\` datetime NULL,
        PRIMARY KEY (\`id\`),
        UNIQUE INDEX \`IDX_biometric_cred_userId\` (\`userId\`),
        CONSTRAINT \`FK_biometric_cred_user\` FOREIGN KEY (\`userId\`) REFERENCES \`user\` (\`id\`) ON DELETE CASCADE
      ) ENGINE=InnoDB
    `);

    // 2. Create biometric_challenge table
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS \`biometric_challenge\` (
        \`id\` int NOT NULL AUTO_INCREMENT,
        \`challengeId\` varchar(36) NOT NULL,
        \`userId\` int NOT NULL,
        \`electionId\` int NULL,
        \`challengeType\` varchar(30) NOT NULL,
        \`challengeNonceHash\` varchar(64) NOT NULL,
        \`challengeInstructions\` text NOT NULL,
        \`expiresAt\` datetime NOT NULL,
        \`consumedAt\` datetime NULL,
        \`ipAddress\` varchar(45) NULL,
        \`createdAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        PRIMARY KEY (\`id\`),
        UNIQUE INDEX \`IDX_biometric_chal_uuid\` (\`challengeId\`),
        INDEX \`IDX_biometric_chal_user\` (\`userId\`),
        INDEX \`IDX_biometric_chal_expires\` (\`expiresAt\`),
        INDEX \`IDX_biometric_chal_election\` (\`electionId\`),
        CONSTRAINT \`FK_biometric_chal_user\` FOREIGN KEY (\`userId\`) REFERENCES \`user\` (\`id\`) ON DELETE CASCADE
      ) ENGINE=InnoDB
    `);

    // 3. Create voting_authorization table
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS \`voting_authorization\` (
        \`id\` int NOT NULL AUTO_INCREMENT,
        \`authorizationTokenHash\` varchar(64) NOT NULL,
        \`userId\` int NOT NULL,
        \`electionId\` int NOT NULL,
        \`verificationId\` varchar(36) NOT NULL,
        \`status\` varchar(20) NOT NULL DEFAULT 'issued',
        \`expiresAt\` datetime NOT NULL,
        \`consumedAt\` datetime NULL,
        \`transactionHash\` varchar(66) NULL,
        \`createdAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        PRIMARY KEY (\`id\`),
        UNIQUE INDEX \`IDX_voting_auth_token_hash\` (\`authorizationTokenHash\`),
        INDEX \`IDX_voting_auth_user\` (\`userId\`),
        INDEX \`IDX_voting_auth_election\` (\`electionId\`),
        INDEX \`IDX_voting_auth_expires\` (\`expiresAt\`),
        CONSTRAINT \`FK_voting_auth_user\` FOREIGN KEY (\`userId\`) REFERENCES \`user\` (\`id\`) ON DELETE CASCADE,
        CONSTRAINT \`FK_voting_auth_poll\` FOREIGN KEY (\`electionId\`) REFERENCES \`poll\` (\`id\`) ON DELETE CASCADE
      ) ENGINE=InnoDB
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query("DROP TABLE IF EXISTS `voting_authorization`");
    await queryRunner.query("DROP TABLE IF EXISTS `biometric_challenge`");
    await queryRunner.query("DROP TABLE IF EXISTS `biometric_credential`");
  }
}
