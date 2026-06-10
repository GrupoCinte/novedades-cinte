import { defineConfig } from 'vite';
import { createRemoteConfig } from '@cinte/vite-config';

export default defineConfig(
  createRemoteConfig({
    name: 'consultor',
    port: 5177,
    exposes: {
      './PortalHome': './src/ConsultorPortalHome.jsx',
      './NovedadesPage': './src/ConsultorNovedadesPage.jsx',
    },
  })
);
