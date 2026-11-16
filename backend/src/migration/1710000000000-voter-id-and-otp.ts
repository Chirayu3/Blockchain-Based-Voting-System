import { MigrationInterface, QueryRunner } from "typeorm";

export class voterIdAndOtp1710000000000 implements MigrationInterface {
  name = "voterIdAndOtp1710000000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    const hasVoterId = await queryRunner.hasColumn("user", "voterId");
    if (!hasVoterId) {
      await queryRunner.query(
        "ALTER TABLE `user` ADD `voterId` varchar(30) NULL"
      );
    }

    const hasEmailVerified = await queryRunner.hasColumn(
      "user",
      "emailVerified"
    );
    if (!hasEmailVerified) {
      await queryRunner.query(
        "ALTER TABLE `user` ADD `emailVerified` tinyint NOT NULL DEFAULT 0"
      );
    }

    const hasIsActive = await queryRunner.hasColumn("user", "isActive");
    if (!hasIsActive) {
      await queryRunner.query(
        "ALTER TABLE `user` ADD `isActive` tinyint NOT NULL DEFAULT 1"
      );
    }

    // Safely backfill legacy users with unique Voter IDs
    const users: Array<{ id: number; voterId: string | null }> =
      await queryRunner.query("SELECT `id`, `voterId` FROM `user` ORDER BY `id` ASC");

    for (const user of users) {
      if (!user.voterId) {
        const generatedVoterId = `BBVS-2026-${String(user.id).padStart(6, "0")}`;
        await queryRunner.query(
          "UPDATE `user` SET `voterId` = ? WHERE `id` = ?",
          [generatedVoterId, user.id]
        );
      }
    }

    // Enforce NOT NULL and UNIQUE constraint on voterId
    await queryRunner.query(
      "ALTER TABLE `user` MODIFY `voterId` varchar(30) NOT NULL"
    );

    const hasVoterIdIndex = await queryRunner.query(
      "SHOW INDEX FROM `user` WHERE Key_name = 'IDX_user_voterId'"
    );
    if (!hasVoterIdIndex || hasVoterIdIndex.length === 0) {
      await queryRunner.query(
        "CREATE UNIQUE INDEX `IDX_user_voterId` ON `user` (`voterId`)"
      );
    }

    // Create otp_challenge table
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS \`otp_challenge\` (
        \`id\` int NOT NULL AUTO_INCREMENT,
        \`challengeId\` varchar(36) NOT NULL,
        \`userId\` int NOT NULL,
        \`otpHash\` varchar(64) NOT NULL,
        \`expiresAt\` datetime NOT NULL,
        \`attempts\` int NOT NULL DEFAULT 0,
        \`consumedAt\` datetime NULL,
        \`ipAddress\` varchar(45) NULL,
        \`createdAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        PRIMARY KEY (\`id\`),
        UNIQUE INDEX \`IDX_otp_challenge_uuid\` (\`challengeId\`),
        INDEX \`IDX_otp_user\` (\`userId\`),
        INDEX \`IDX_otp_expires\` (\`expiresAt\`),
        CONSTRAINT \`FK_otp_user\` FOREIGN KEY (\`userId\`) REFERENCES \`user\` (\`id\`) ON DELETE CASCADE
      ) ENGINE=InnoDB
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query("DROP TABLE IF EXISTS `otp_challenge`");

    const hasVoterIdIndex = await queryRunner.query(
      "SHOW INDEX FROM `user` WHERE Key_name = 'IDX_user_voterId'"
    );
    if (hasVoterIdIndex && hasVoterIdIndex.length > 0) {
      await queryRunner.query("DROP INDEX `IDX_user_voterId` ON `user`");
    }

    const hasIsActive = await queryRunner.hasColumn("user", "isActive");
    if (hasIsActive) {
      await queryRunner.query("ALTER TABLE `user` DROP COLUMN `isActive`");
    }

    const hasEmailVerified = await queryRunner.hasColumn(
      "user",
      "emailVerified"
    );
    if (hasEmailVerified) {
      await queryRunner.query(
        "ALTER TABLE `user` DROP COLUMN `emailVerified`"
      );
    }

    const hasVoterId = await queryRunner.hasColumn("user", "voterId");
    if (hasVoterId) {
      await queryRunner.query("ALTER TABLE `user` DROP COLUMN `voterId`");
    }
  }
}
