import { MigrationInterface, QueryRunner } from "typeorm";

export class ensurePollStatusEnum1720000000000 implements MigrationInterface {
  name = "ensurePollStatusEnum1720000000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    const hasStatus = await queryRunner.hasColumn("poll", "status");
    if (!hasStatus) {
      await queryRunner.query(
        "ALTER TABLE `poll` ADD `status` varchar(50) NOT NULL DEFAULT 'not-started'"
      );
    } else {
      await queryRunner.query(
        "ALTER TABLE `poll` ALTER COLUMN `status` SET DEFAULT 'not-started'"
      );
    }

    await queryRunner.query(
      "UPDATE `poll` SET `status` = 'not-started' WHERE `status` IS NULL OR `status` NOT IN ('not-started', 'running', 'finished')"
    );

    const hasOtpChallengeTable = await queryRunner.hasTable("otp_challenge");
    if (hasOtpChallengeTable) {
      await queryRunner.query(
        "ALTER TABLE `otp_challenge` MODIFY `challengeId` varchar(255) NOT NULL"
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const hasStatus = await queryRunner.hasColumn("poll", "status");
    if (hasStatus) {
      await queryRunner.query(
        "ALTER TABLE `poll` ALTER COLUMN `status` SET DEFAULT 'running'"
      );
    }
  }
}
