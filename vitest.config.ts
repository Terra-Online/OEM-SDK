import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  resolve: {
    alias: {
      '@opendfieldmap/core': fileURLToPath(new URL('./packages/core/src/index.ts', import.meta.url)),
      '@opendfieldmap/map': fileURLToPath(new URL('./packages/map/src/index.ts', import.meta.url)),
      '@opendfieldmap/sdk': fileURLToPath(new URL('./packages/sdk/src/index.ts', import.meta.url)),
      '@opendfieldmap/react': fileURLToPath(new URL('./packages/react/src/index.tsx', import.meta.url)),
    },
  },
  test: { environment: 'node', include: ['tests/**/*.test.ts', 'tests/**/*.test.mjs'] },
});
