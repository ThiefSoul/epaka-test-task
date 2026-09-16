import { config as loadEnv } from 'dotenv';
import { defineConfig } from 'vitest/config';

loadEnv({ path: '.env.test', quiet: true });

export default defineConfig({
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    globals: true,
    root: './',
    include: ['**/*.spec.ts', '**/*.integration-spec.ts', '**/*.e2e-spec.ts'],
    fileParallelism: false,
  },
});
