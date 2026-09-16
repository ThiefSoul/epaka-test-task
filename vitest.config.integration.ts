import { config as loadEnv } from 'dotenv';
import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

loadEnv({ path: '.env.test', quiet: true });

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    globals: true,
    root: './',
    include: ['**/*.integration-spec.ts'],
  },
});
