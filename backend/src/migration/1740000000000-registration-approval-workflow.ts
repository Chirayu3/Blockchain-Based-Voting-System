import { MigrationInterface, QueryRunner } from "typeorm";

export class registrationApprovalWorkflow1740000000000
  implements MigrationInterface
{
  name = "registrationApprovalWorkflow1740000000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Add registrationStatus column if not exists
    const hasRegStatus = await queryRunner.hasColumn(
      "user",
      "registrationStatus"
    );
    if (!hasRegStatus) {
      await queryRunner.query(
        "ALTER TABLE `user` ADD `registrationStatus` varchar(30) NOT NULL DEFAULT 'PENDING_APPROVAL'"
      );
    }

    // 2. Add registrationSubmittedAt column if not exists
    const hasRegSubmitted = await queryRunner.hasColumn(
      "user",
      "registrationSubmittedAt"
    );
    if (!hasRegSubmitted) {
      await queryRunner.query(
        "ALTER TABLE `user` ADD `registrationSubmittedAt` datetime NULL"
      );
    }

    // 3. Add registrationReviewedAt column if not exists
    const hasRegReviewed = await queryRunner.hasColumn(
      "user",
      "registrationReviewedAt"
    );
    if (!hasRegReviewed) {
      await queryRunner.query(
        "ALTER TABLE `user` ADD `registrationReviewedAt` datetime NULL"
      );
    }

    // 4. Add reviewedBy column if not exists
    const hasReviewedBy = await queryRunner.hasColumn("user", "reviewedBy");
    if (!hasReviewedBy) {
      await queryRunner.query(
        "ALTER TABLE `user` ADD `reviewedBy` int NULL"
      );
    }

    // 5. Add rejectionReason column if not exists
    const hasRejectionReason = await queryRunner.hasColumn(
      "user",
      "rejectionReason"
    );
    if (!hasRejectionReason) {
      await queryRunner.query(
        "ALTER TABLE `user` ADD `rejectionReason` text NULL"
      );
    }

    // 6. Modify voterId to allow NULL (pending users will have NULL voterId)
    await queryRunner.query(
      "ALTER TABLE `user` MODIFY `voterId` varchar(30) NULL"
    );

    // 7. Ensure unique index on voterId exists
    const hasVoterIdIndex = await queryRunner.query(
      "SHOW INDEX FROM `user` WHERE Key_name = 'IDX_user_voterId'"
    );
    if (!hasVoterIdIndex || hasVoterIdIndex.length === 0) {
      await queryRunner.query(
        "CREATE UNIQUE INDEX `IDX_user_voterId` ON `user` (`voterId`)"
      );
    }

    // 8. Add indexes for fast querying of pending registrations and deadlines
    const hasStatusIndex = await queryRunner.query(
      "SHOW INDEX FROM `user` WHERE Key_name = 'IDX_user_registrationStatus'"
    );
    if (!hasStatusIndex || hasStatusIndex.length === 0) {
      await queryRunner.query(
        "CREATE INDEX `IDX_user_registrationStatus` ON `user` (`registrationStatus`)"
      );
    }

    const hasSubmittedIndex = await queryRunner.query(
      "SHOW INDEX FROM `user` WHERE Key_name = 'IDX_user_registrationSubmittedAt'"
    );
    if (!hasSubmittedIndex || hasSubmittedIndex.length === 0) {
      await queryRunner.query(
        "CREATE INDEX `IDX_user_registrationSubmittedAt` ON `user` (`registrationSubmittedAt`)"
      );
    }

    // 9. Create email_delivery_log table for persistent outbox & audit tracking
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS \`email_delivery_log\` (
        \`id\` int NOT NULL AUTO_INCREMENT,
        \`userId\` int NULL,
        \`emailType\` varchar(50) NOT NULL,
        \`recipientEmail\` varchar(180) NOT NULL,
        \`recipientName\` varchar(100) NOT NULL,
        \`status\` varchar(20) NOT NULL DEFAULT 'PENDING',
        \`payload\` text NULL,
        \`errorMessage\` text NULL,
        \`attempts\` int NOT NULL DEFAULT 0,
        \`sentAt\` datetime NULL,
        \`createdAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        \`updatedAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        PRIMARY KEY (\`id\`),
        INDEX \`IDX_email_log_user\` (\`userId\`),
        INDEX \`IDX_email_log_status\` (\`status\`),
        INDEX \`IDX_email_log_type\` (\`emailType\`),
        CONSTRAINT \`FK_email_log_user\` FOREIGN KEY (\`userId\`) REFERENCES \`user\` (\`id\`) ON DELETE SET NULL
      ) ENGINE=InnoDB
    `);

    // 10. Backfill existing legacy users:
    // Existing users who have a voterId or are admins must be marked APPROVED
    await queryRunner.query(`
      UPDATE \`user\`
      SET
        \`registrationStatus\` = 'APPROVED',
        \`registrationSubmittedAt\` = COALESCE(\`registrationSubmittedAt\`, NOW()),
        \`registrationReviewedAt\` = COALESCE(\`registrationReviewedAt\`, NOW())
      WHERE \`voterId\` IS NOT NULL OR \`admin\` = 1
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query("DROP TABLE IF EXISTS `email_delivery_log`");

    const hasSubmittedIndex = await queryRunner.query(
      "SHOW INDEX FROM `user` WHERE Key_name = 'IDX_user_registrationSubmittedAt'"
    );
    if (hasSubmittedIndex && hasSubmittedIndex.length > 0) {
      await queryRunner.query(
        "DROP INDEX `IDX_user_registrationSubmittedAt` ON `user`"
      );
    }

    const hasStatusIndex = await queryRunner.query(
      "SHOW INDEX FROM `user` WHERE Key_name = 'IDX_user_registrationStatus'"
    );
    if (hasStatusIndex && hasStatusIndex.length > 0) {
      await queryRunner.query(
        "DROP INDEX `IDX_user_registrationStatus` ON `user`"
      );
    }

    const hasRejectionReason = await queryRunner.hasColumn(
      "user",
      "rejectionReason"
    );
    if (hasRejectionReason) {
      await queryRunner.query(
        "ALTER TABLE `user` DROP COLUMN `rejectionReason`"
      );
    }

    const hasReviewedBy = await queryRunner.hasColumn("user", "reviewedBy");
    if (hasReviewedBy) {
      await queryRunner.query("ALTER TABLE `user` DROP COLUMN `reviewedBy`");
    }

    const hasRegReviewed = await queryRunner.hasColumn(
      "user",
      "registrationReviewedAt"
    );
    if (hasRegReviewed) {
      await queryRunner.query(
        "ALTER TABLE `user` DROP COLUMN `registrationReviewedAt`"
      );
    }

    const hasRegSubmitted = await queryRunner.hasColumn(
      "user",
      "registrationSubmittedAt"
    );
    if (hasRegSubmitted) {
      await queryRunner.query(
        "ALTER TABLE `user` DROP COLUMN `registrationSubmittedAt`"
      );
    }

    const hasRegStatus = await queryRunner.hasColumn(
      "user",
      "registrationStatus"
    );
    if (hasRegStatus) {
      await queryRunner.query(
        "ALTER TABLE `user` DROP COLUMN `registrationStatus`"
      );
    }
  }
}
