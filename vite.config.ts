import { defineConfig } from 'vitest/config';

export default defineConfig({
  base: './',
  build: { sourcemap: true },
  test: {
    environment: 'node',
    include: ['tests/unit/**/*.test.ts', 'tests/integration/**/*.test.ts'],
  },
});
