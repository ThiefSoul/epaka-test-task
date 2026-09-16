import { DeleteObjectsCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';
import { createClient } from 'redis';
import { FileStorageType } from '../../persistance/file-storage-type.js';
import { type FilesE2eContext } from './files-e2e-support.js';

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

export async function createHotFile(
  context: FilesE2eContext,
  fileType: string,
  fileId: string,
): Promise<void> {
  await createFile(context, fileType, fileId, FileStorageType.HOT);
}

export async function createArchivedFile(
  context: FilesE2eContext,
  fileType: string,
  fileId: string,
): Promise<void> {
  await createFile(context, fileType, fileId, FileStorageType.ARCHIVE);
}

async function createFile(
  context: FilesE2eContext,
  fileType: string,
  fileId: string,
  storageType: FileStorageType = FileStorageType.HOT,
): Promise<void> {
  await context.metadataRepository.save({
    fileType,
    fileId,
    storageType,
  });
  await context.storage.put(
    storageType,
    `${fileType}/${fileId}`,
    Buffer.from(`${storageType}/${fileType}/${fileId}`),
  );
  if (storageType === FileStorageType.HOT) {
    await context.cache.rememberHotFile(fileType, fileId);
  }
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
