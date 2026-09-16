import { z } from 'zod';

export const envSchema = z.object({
  PORT: z.coerce.number().default(3000),

  AWS_REGION: z.string().default('eu-central-1'),
  AWS_ACCESS_KEY_ID: z.string().default('test'),
  AWS_SECRET_ACCESS_KEY: z.string().default('test'),
  AWS_ENDPOINT: z.string().default('http://localstack:4566'),
  S3_HOT_BUCKET: z.string().default('epaka-hot'),
  S3_ARCHIVE_BUCKET: z.string().default('epaka-archive'),

  FILES_ARCHIVE_AFTER_SECONDS: z.coerce.number().int().positive().default(2592000),
  FILES_ARCHIVE_BATCH_SIZE: z.coerce.number().int().positive().default(100),

  REDIS_HOST: z.string().default('redis'),
  REDIS_PORT: z.coerce.number().default(6379),
  REDIS_DB: z.coerce.number().default(0),

  DB_HOST: z.string().default('db'),
  DB_PORT: z.coerce.number().default(5432),
  DB_NAME: z.string().default('epaka'),
  DB_USER: z.string().default('epaka'),
  DB_PASSWORD: z.string().default('epaka'),
  DATABASE_URL: z.string().default('postgresql://epaka:epaka@db:5432/epaka'),
});
