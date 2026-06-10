import { defineConfig } from 'vite';
import { createRemoteConfig } from '@cinte/vite-config';

export default defineConfig(
  createRemoteConfig({
    name: 'comercial',
    port: 5180,
    exposes: {
      './Module': './src/Module.jsx',
    },
  })
);
