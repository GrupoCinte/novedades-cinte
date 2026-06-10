import { defineConfig } from 'vite';
import { createRemoteConfig } from '@cinte/vite-config';

export default defineConfig(
  createRemoteConfig({
    name: 'directorio',
    port: 5182,
    exposes: {
      './Module': './src/Module.jsx',
    },
  })
);
