import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import {
  DeleteObjectsCommand,
  ListObjectsV2Command,
  S3Client,
} from '@aws-sdk/client-s3';
import { raw } from 'express';
import { createClient } from 'redis';
import { DataSource, Repository } from 'typeorm';
import { AppModule } from '../../../app.module.js';
import { CreateFileMetadata1789483094152 } from '../../../database/migrations/1789483094152-CreateFileMetadata.js';
import { StorageService } from '../../../storage/storage.service.js';
import { FileMetadataEntity } from '../../persistance/file-metadata.entity.js';

export type FilesE2eContext = {
  app: INestApplication;
  config: ConfigService;
  dataSource: DataSource;
  metadataRepository: Repository<FileMetadataEntity>;
  storage: StorageService;
  s3Client: S3Client;
  hotBucket: string;
  archiveBucket: string;
};

export async function createFilesE2eContext(): Promise<FilesE2eContext> {
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  const app = moduleRef.createNestApplication();
  app.use(
    '/files/:fileType/:fileId',
    raw({ type: 'application/octet-stream', limit: '10mb' }),
  );
  await app.init();

  const config = app.get(ConfigService);
  const dataSource = app.get(DataSource);

  await runTestMigrations(config);

  const s3Client = new S3Client({
    region: config.getOrThrow<string>('AWS_REGION'),
    endpoint: config.getOrThrow<string>('AWS_ENDPOINT'),
    forcePathStyle: true,
    credentials: {
      accessKeyId: config.getOrThrow<string>('AWS_ACCESS_KEY_ID'),
      secretAccessKey: config.getOrThrow<string>('AWS_SECRET_ACCESS_KEY'),
    },
  });

  return {
    app,
    config,
    dataSource,
    metadataRepository: dataSource.getRepository(FileMetadataEntity),
    storage: app.get(StorageService),
    s3Client,
    hotBucket: config.getOrThrow<string>('S3_HOT_BUCKET'),
    archiveBucket: config.getOrThrow<string>('S3_ARCHIVE_BUCKET'),
  };
}

async function runTestMigrations(config: ConfigService): Promise<void> {
  const dataSource = new DataSource({
    type: 'postgres',
    host: config.getOrThrow<string>('DB_HOST'),
    port: config.getOrThrow<number>('DB_PORT'),
    username: config.getOrThrow<string>('DB_USER'),
    password: config.getOrThrow<string>('DB_PASSWORD'),
    database: config.getOrThrow<string>('DB_NAME'),
    migrations: [CreateFileMetadata1789483094152],
  });

  await dataSource.initialize();

  try {
    await dataSource.runMigrations();
  } finally {
    await dataSource.destroy();
  }
}

export async function cleanFilesE2eData(
  context: FilesE2eContext,
  fileTypePrefix: string,
): Promise<void> {
  await cleanRedis(context);
  await cleanS3Bucket(context, context.hotBucket, fileTypePrefix);
  await cleanS3Bucket(context, context.archiveBucket, fileTypePrefix);

  await context.dataSource.query(
    'DELETE FROM file_metadata WHERE file_type LIKE $1',
    [`${fileTypePrefix}-%`],
  );
}

async function cleanRedis(context: FilesE2eContext): Promise<void> {
  const redisDb = context.config.getOrThrow<number>('REDIS_DB');

  if (redisDb !== 1) {
    throw new Error(`Refusing to flush non-test Redis DB: ${redisDb}`);
  }

  const client = createClient({
    database: redisDb,
    socket: {
      host: context.config.getOrThrow<string>('REDIS_HOST'),
      port: context.config.getOrThrow<number>('REDIS_PORT'),
    },
  });

  await client.connect();
  await client.flushDb();
  await client.quit();
}

async function cleanS3Bucket(
  context: FilesE2eContext,
  bucket: string,
  fileTypePrefix: string,
): Promise<void> {
  assertTestBucket(bucket);

  const objects = await context.s3Client.send(
    new ListObjectsV2Command({
      Bucket: bucket,
      Prefix: `${fileTypePrefix}-`,
    }),
  );

  if (!objects.Contents?.length) {
    return;
  }

  await context.s3Client.send(
    new DeleteObjectsCommand({
      Bucket: bucket,
      Delete: {
        Objects: objects.Contents.map(({ Key }) => ({ Key })),
      },
    }),
  );
}

function assertTestBucket(bucket: string): void {
  if (!bucket.includes('-test-')) {
    throw new Error(`Refusing to clean non-test S3 bucket: ${bucket}`);
  }
}
