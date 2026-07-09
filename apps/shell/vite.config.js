import { defineConfig, loadEnv } from 'vite';
import { createShellConfig } from '@cinte/vite-config';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const config = createShellConfig(env, { mode });
  config.plugins.push(tailwindcss());
  return config;
});
