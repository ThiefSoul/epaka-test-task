import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateFileMetadata1789483094152 implements MigrationInterface {
  name = 'CreateFileMetadata1789483094152';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "public"."file_metadata_storage_type_enum" AS ENUM('hot', 'archive')`,
    );
    await queryRunner.query(
      `CREATE TABLE "file_metadata"
       (
         "id"           SERIAL                                     NOT NULL,
         "file_type"    character varying                          NOT NULL,
         "file_id"      character varying                          NOT NULL,
         "storage_type" "public"."file_metadata_storage_type_enum" NOT NULL DEFAULT 'hot',
         "created_at"   TIMESTAMP                                  NOT NULL DEFAULT now(),
         CONSTRAINT "UQ_01355c09b3701be2e155dac0855" UNIQUE ("file_type", "file_id"),
         CONSTRAINT "PK_b8805dd11c868561f260a0410ae" PRIMARY KEY ("id")
       )`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_1ace6137d6ac177f65d912a1b0" ON "file_metadata"  ("storage_type", "created_at") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_6c01cd095309704334f2760e57" ON "file_metadata"  ("file_type") `,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX "public"."IDX_6c01cd095309704334f2760e57"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_1ace6137d6ac177f65d912a1b0"`,
    );
    await queryRunner.query(`DROP TABLE "file_metadata"`);
    await queryRunner.query(
      `DROP TYPE "public"."file_metadata_storage_type_enum"`,
    );
  }
}
