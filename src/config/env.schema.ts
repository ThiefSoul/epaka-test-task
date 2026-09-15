import { z } from 'zod';

export const envSchema = z.object({
  PORT: z.coerce.number().default(3000),

  DB_HOST: z.string().default('db'),
  DB_PORT: z.coerce.number().default(5432),
  DB_NAME: z.string().default('epaka'),
  DB_USER: z.string().default('epaka'),
  DB_PASSWORD: z.string().default('epaka'),
  DATABASE_URL: z.string().default('postgresql://epaka:epaka@db:5432/epaka'),
});
