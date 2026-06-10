import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@cinte/ui-shell': path.join(repoRoot, 'packages/ui-shell/src'),
    },
  },
  test: {
    environment: 'happy-dom',
    include: ['src/**/*.test.{js,jsx}'],
    setupFiles: ['@cinte/vitest-config/setup.js'],
  },
});
