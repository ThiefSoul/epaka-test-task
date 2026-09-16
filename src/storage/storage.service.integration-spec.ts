import { ConfigModule, ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import {
  DeleteObjectsCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  S3Client,
} from '@aws-sdk/client-s3';
import { randomUUID } from 'node:crypto';
import { envSchema } from '../config/env.schema.js';
import { FileStorageType } from '../files/persistance/file-storage-type.js';
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
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          envFilePath: '.env.test',
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

    await cleanBucket(config.getOrThrow<string>('S3_HOT_BUCKET'));
    await cleanBucket(config.getOrThrow<string>('S3_ARCHIVE_BUCKET'));
  });

  afterAll(async () => {
    await cleanBucket(config.getOrThrow<string>('S3_HOT_BUCKET'));
    await cleanBucket(config.getOrThrow<string>('S3_ARCHIVE_BUCKET'));
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

  async function cleanBucket(bucket: string): Promise<void> {
    assertTestBucket(bucket);

    const objects = await client.send(
      new ListObjectsV2Command({ Bucket: bucket }),
    );

    if (!objects.Contents?.length) {
      return;
    }

    await client.send(
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
});
