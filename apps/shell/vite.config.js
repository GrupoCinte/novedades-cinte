import { defineConfig, loadEnv } from 'vite';
import { createShellConfig } from '@cinte/vite-config';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return createShellConfig(env, { mode });
});
