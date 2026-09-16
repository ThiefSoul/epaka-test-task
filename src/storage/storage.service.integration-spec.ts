import { ConfigModule, ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import {
  type BucketLocationConstraint,
  CreateBucketCommand,
  DeleteBucketCommand,
  DeleteObjectsCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  S3Client,
} from '@aws-sdk/client-s3';
import { randomUUID } from 'node:crypto';
import { envSchema } from '../config/env.schema.js';
import { FileStorageType } from '../files/persistance/file-storage-type.js';
import { isS3NotFoundError } from './s3-error.js';
import { StorageService } from './storage.service.js';

const storageCases = [
  {
    bucketEnv: 'S3_HOT_BUCKET',
    storageType: FileStorageType.HOT,
  },
  {
    bucketEnv: 'S3_ARCHIVE_BUCKET',
    storageType: FileStorageType.ARCHIVE,
  },
];

describe('StorageService', () => {
  let service: StorageService;
  let config: ConfigService;
  let client: S3Client;

  beforeAll(async () => {
    process.env.AWS_ENDPOINT ??= 'http://127.0.0.1:4566';
    process.env.AWS_REGION ??= 'eu-central-1';
    process.env.AWS_ACCESS_KEY_ID ??= 'test';
    process.env.AWS_SECRET_ACCESS_KEY ??= 'test';
    process.env.S3_HOT_BUCKET = 'epaka-test-hot';
    process.env.S3_ARCHIVE_BUCKET = 'epaka-test-archive';

    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          validationSchema: envSchema,
        }),
      ],
      providers: [StorageService],
    }).compile();

    service = moduleRef.get(StorageService);
    config = moduleRef.get(ConfigService);
    client = new S3Client({
      region: config.getOrThrow<string>('AWS_REGION'),
      endpoint: config.getOrThrow<string>('AWS_ENDPOINT'),
      forcePathStyle: true,
      credentials: {
        accessKeyId: config.getOrThrow<string>('AWS_ACCESS_KEY_ID'),
        secretAccessKey: config.getOrThrow<string>('AWS_SECRET_ACCESS_KEY'),
      },
    });

    await ensureBucket(config.getOrThrow<string>('S3_HOT_BUCKET'));
    await ensureBucket(config.getOrThrow<string>('S3_ARCHIVE_BUCKET'));
  });

  afterAll(async () => {
    await deleteBucket(config.getOrThrow<string>('S3_HOT_BUCKET'));
    await deleteBucket(config.getOrThrow<string>('S3_ARCHIVE_BUCKET'));
  });

  describe.each(storageCases)(
    '$storageType storage',
    ({ bucketEnv, storageType }) => {
      it('stores an object in the matching bucket', async () => {
        const key = `storage-service-spec/${storageType}-${randomUUID()}`;
        const body = Buffer.from(`${storageType} payload`);

        await service.put(storageType, key, body);

        await client.send(
          new HeadObjectCommand({
            Bucket: config.getOrThrow<string>(bucketEnv),
            Key: key,
          }),
        );

        await service.delete(storageType, key);
      });

      it('reads an object', async () => {
        const key = `storage-service-spec/${storageType}-${randomUUID()}`;
        const body = Buffer.from(`${storageType} payload`);

        await service.put(storageType, key, body);

        await expect(service.get(storageType, key)).resolves.toEqual(body);

        await service.delete(storageType, key);
      });

      it('deletes an object', async () => {
        const key = `storage-service-spec/${storageType}-${randomUUID()}`;
        const body = Buffer.from(`${storageType} payload`);

        await service.put(storageType, key, body);
        await service.delete(storageType, key);

        await expect(service.exists(storageType, key)).resolves.toBe(false);
      });

      it('checks if an object exists', async () => {
        const key = `storage-service-spec/${storageType}-${randomUUID()}`;
        const body = Buffer.from(`${storageType} payload`);

        await expect(service.exists(storageType, key)).resolves.toBe(false);

        await service.put(storageType, key, body);

        await expect(service.exists(storageType, key)).resolves.toBe(true);

        await service.delete(storageType, key);
      });
    },
  );

  async function ensureBucket(bucket: string): Promise<void> {
    try {
      await client.send(new HeadBucketCommand({ Bucket: bucket }));
    } catch {
      await client.send(
        new CreateBucketCommand({
          Bucket: bucket,
          CreateBucketConfiguration: {
            LocationConstraint:
              config.getOrThrow<BucketLocationConstraint>('AWS_REGION'),
          },
        }),
      );
    }
  }

  async function deleteBucket(bucket: string): Promise<void> {
    try {
      const objects = await client.send(
        new ListObjectsV2Command({ Bucket: bucket }),
      );

      if (objects.Contents?.length) {
        await client.send(
          new DeleteObjectsCommand({
            Bucket: bucket,
            Delete: {
              Objects: objects.Contents.map(({ Key }) => ({ Key })),
            },
          }),
        );
      }

      await client.send(new DeleteBucketCommand({ Bucket: bucket }));
    } catch (error) {
      if (!isS3NotFoundError(error)) {
        throw error;
      }
    }
  }
});
