import { defineConfig } from 'vite';
import { createRemoteConfig } from '@cinte/vite-config';

export default defineConfig(
  createRemoteConfig({
    name: 'capitalHumano',
    port: 5181,
    exposes: {
      './Module': './src/Module.jsx',
    },
  })
);
