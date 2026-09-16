import {
  DeleteObjectsCommand,
  ListObjectsV2Command,
  S3Client,
} from '@aws-sdk/client-s3';
import { execFileSync } from 'node:child_process';

const s3 = new S3Client({
  endpoint: 'http://localhost:4566',
  region: 'eu-central-1',
  forcePathStyle: true,
  credentials: {
    accessKeyId: 'test',
    secretAccessKey: 'test',
  },
});

let deletedObjects = 0;

await cleanupS3();
cleanPostgres();
cleanRedis();
console.log('Done.');

async function cleanupS3(): Promise<void> {
  await cleanBucket('epaka-hot');
  await cleanBucket('epaka-archive');
  console.log(`S3 cleaned. ${deletedObjects} objects deleted.`);
}

async function cleanBucket(bucket: string): Promise<void> {
  let continuationToken: string | undefined;

  do {
    const result = await s3.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: 'load-type-',
        ContinuationToken: continuationToken,
      }),
    );
    const keys = result.Contents?.map(({ Key }) => Key).filter(Boolean) ?? [];

    if (keys.length > 0) {
      await s3.send(
        new DeleteObjectsCommand({
          Bucket: bucket,
          Delete: {
            Objects: keys.map((Key) => ({ Key })),
          },
        }),
      );
      deletedObjects += keys.length;
    }

    continuationToken = result.NextContinuationToken;
  } while (continuationToken);
}

function cleanPostgres(): void {
  execFileSync(
    'docker',
    [
      'compose',
      'exec',
      '-T',
      'db',
      'psql',
      '-U',
      'epaka',
      '-d',
      'epaka',
      '-c',
      "DELETE FROM file_metadata WHERE file_type LIKE 'load-type-%';",
    ],
    { stdio: 'pipe' },
  );
  console.log('PostgreSQL cleaned.');
}

function cleanRedis(): void {
  execFileSync(
    'docker',
    [
      'compose',
      'exec',
      '-T',
      'redis',
      'redis-cli',
      'EVAL',
      "for _, key in ipairs(redis.call('KEYS', ARGV[1])) do redis.call('DEL', key) end",
      '0',
      'hot-files:load-type-*',
    ],
    { stdio: 'pipe' },
  );
  console.log('Redis cleaned.');
}
