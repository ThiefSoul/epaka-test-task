import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { S3Client } from '@aws-sdk/client-s3';
import { raw } from 'express';
import { DataSource, Repository } from 'typeorm';
import { AppModule } from '../../../app.module.js';
import { CreateFileMetadata1789483094152 } from '../../../database/migrations/1789483094152-CreateFileMetadata.js';
import { StorageService } from '../../../storage/storage.service.js';
import { FileCacheService } from '../../file-cache.service.js';
import { FileMetadataEntity } from '../../persistance/file-metadata.entity.js';

export type FilesE2eContext = {
  app: INestApplication;
  config: ConfigService;
  dataSource: DataSource;
  metadataRepository: Repository<FileMetadataEntity>;
  storage: StorageService;
  cache: FileCacheService;
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
    cache: app.get(FileCacheService),
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
