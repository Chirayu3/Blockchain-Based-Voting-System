import { MigrationInterface, QueryRunner } from "typeorm";

export class addTransactionAndPollFields1700000000000
  implements MigrationInterface
{
  name = "addTransactionAndPollFields1700000000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    const hasDescription = await queryRunner.hasColumn("poll", "description");
    if (!hasDescription) {
      await queryRunner.query(
        "ALTER TABLE `poll` ADD `description` text NULL"
      );
    }

    const hasStatus = await queryRunner.hasColumn("poll", "status");
    if (!hasStatus) {
      await queryRunner.query(
        "ALTER TABLE `poll` ADD `status` varchar(50) NOT NULL DEFAULT 'not-started'"
      );
    }

    const hasCreatedAt = await queryRunner.hasColumn("poll", "createdAt");
    if (!hasCreatedAt) {
      await queryRunner.query(
        "ALTER TABLE `poll` ADD `createdAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)"
      );
    }

    const hasUpdatedAt = await queryRunner.hasColumn("poll", "updatedAt");
    if (!hasUpdatedAt) {
      await queryRunner.query(
        "ALTER TABLE `poll` ADD `updatedAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6)"
      );
    }

    const hasInfo = await queryRunner.hasColumn("candidate", "info");
    if (!hasInfo) {
      await queryRunner.query("ALTER TABLE `candidate` ADD `info` text NULL");
    }

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS \`transaction\` (
        \`id\` int NOT NULL AUTO_INCREMENT,
        \`transactionHash\` varchar(255) NOT NULL,
        \`voterId\` int NOT NULL,
        \`electionId\` int NULL,
        \`candidateName\` varchar(255) NOT NULL,
        \`blockNumber\` int NOT NULL,
        \`timestamp\` datetime NOT NULL,
        \`gasUsed\` int NOT NULL,
        \`status\` varchar(50) NOT NULL DEFAULT 'success',
        \`createdAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        UNIQUE INDEX \`IDX_tx_hash\` (\`transactionHash\`),
        PRIMARY KEY (\`id\`),
        CONSTRAINT \`FK_tx_voter\` FOREIGN KEY (\`voterId\`) REFERENCES \`user\` (\`id\`) ON DELETE CASCADE,
        CONSTRAINT \`FK_tx_election\` FOREIGN KEY (\`electionId\`) REFERENCES \`poll\` (\`id\`) ON DELETE SET NULL
      ) ENGINE=InnoDB
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query("DROP TABLE IF EXISTS `transaction`");
    await queryRunner.query("ALTER TABLE `candidate` DROP COLUMN `info`");
    await queryRunner.query("ALTER TABLE `poll` DROP COLUMN `updatedAt`");
    await queryRunner.query("ALTER TABLE `poll` DROP COLUMN `createdAt`");
    await queryRunner.query("ALTER TABLE `poll` DROP COLUMN `status`");
    await queryRunner.query("ALTER TABLE `poll` DROP COLUMN `description`");
  }
}
