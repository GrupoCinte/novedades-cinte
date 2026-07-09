import { defineConfig, loadEnv } from 'vite';
import { createRemoteConfig } from '@cinte/vite-config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const config = createRemoteConfig(
    {
      name: 'novedades',
      port: 5178,
      exposes: {
        './Module': './src/Module.jsx',
      },
    },
    env,
    mode
  );
  config.plugins = config.plugins || [];
  config.plugins.push(tailwindcss());
  return config;
});
