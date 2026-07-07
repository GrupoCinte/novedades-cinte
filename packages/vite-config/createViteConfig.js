import path from 'node:path';
import { fileURLToPath } from 'node:url';
import http from 'node:http';
import https from 'node:https';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { federation } from '@module-federation/vite';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

export function workspaceAliases() {
  return {
    '@cinte/shared': path.join(repoRoot, 'packages/shared/src'),
    '@cinte/api-client': path.join(repoRoot, 'packages/api-client/src'),
  };
}

export function createApiProxyAgent(targetUrl) {
  const t = String(targetUrl || '').trim();
  const opts = { keepAlive: true, keepAliveMsecs: 30_000, maxSockets: 80, maxFreeSockets: 20 };
  return t.startsWith('https:') ? new https.Agent(opts) : new http.Agent(opts);
}

export const mfShared = {
  react: { singleton: true, requiredVersion: '^19.2.0' },
  'react-dom': { singleton: true, requiredVersion: '^19.2.0' },
  'react-router-dom': { singleton: true, requiredVersion: '^7.13.1' },
  '@cinte/ui-shell': { singleton: true },
};


export function createRemoteConfig({ name, port, exposes }) {
  return {
    plugins: [
      react(),
      tailwindcss(),
      federation({
        name,
        filename: 'remoteEntry.js',
        exposes,
        shared: mfShared,
        dts: false,
      }),
    ],
    resolve: { alias: workspaceAliases() },
    server: {
      port,
      host: true,
      strictPort: true,
      cors: true,
    },
    build: {
      target: 'esnext',
      minify: true,
    },
  };
}

export function createShellConfig(env, options = {}) {
  const mode = options.mode || 'development';
  const apiTarget = (env.VITE_API_PROXY_TARGET || 'http://localhost:3005').trim();
  const apiProxyAgent = createApiProxyAgent(apiTarget);
  const devPort = Number(env.VITE_DEV_SERVER_PORT || 5175) || 5175;
  const tunnelDev =
    env.VITE_TUNNEL_DEV === '1' || String(env.VITE_TUNNEL_DEV || '').toLowerCase() === 'true';

  const devRemoteDefaults =
    mode === 'development'
      ? {
          radicacion: 'http://localhost:5176/remoteEntry.js',
          consultor: 'http://localhost:5177/remoteEntry.js',
          novedades: 'http://localhost:5178/remoteEntry.js',
          conciliaciones: 'http://localhost:5179/remoteEntry.js',
          comercial: 'http://localhost:5180/remoteEntry.js',
          capitalHumano: 'http://localhost:5181/remoteEntry.js',
          directorio: 'http://localhost:5182/remoteEntry.js',
        }
      : {};

  const prodRemoteDefaults =
    mode === 'production'
      ? {
          radicacion: 'https://feature-aut-525-desplegar-mfes-separado.d3cnr0btgo56p3.amplifyapp.com/remoteEntry.js',
          consultor: 'https://feature-aut-525-desplegar-mfes-separado.d2252k1313wzx5.amplifyapp.com/remoteEntry.js',
          novedades: 'https://feature-aut-525-desplegar-mfes-separado.dgtr4xj62tx0x.amplifyapp.com/remoteEntry.js',
          conciliaciones: 'https://feature-aut-525-desplegar-mfes-separado.d7s8bipg5wrjr.amplifyapp.com/remoteEntry.js',
          comercial: 'https://feature-aut-525-desplegar-mfes-separado.d1tq8dxouo1dqj.amplifyapp.com/remoteEntry.js',
          capitalHumano: 'https://feature-aut-525-desplegar-mfes-separado.d3pab9yz97nfmw.amplifyapp.com/remoteEntry.js',
          directorio: 'https://feature-aut-525-desplegar-mfes-separado.d1rcg6wcg8o65d.amplifyapp.com/remoteEntry.js',
        }
      : {};

  const remoteDefaults = { ...prodRemoteDefaults, ...devRemoteDefaults };

  const remotes = {
    radicacion: env.VITE_MF_RADICACION_URL || remoteDefaults.radicacion,
    consultor: env.VITE_MF_CONSULTOR_URL || remoteDefaults.consultor,
    novedades: env.VITE_MF_NOVEDADES_URL || remoteDefaults.novedades,
    conciliaciones: env.VITE_MF_CONCILIACIONES_URL || remoteDefaults.conciliaciones,
    comercial: env.VITE_MF_COMERCIAL_URL || remoteDefaults.comercial,
    capitalHumano: env.VITE_MF_CAPITAL_HUMANO_URL || remoteDefaults.capitalHumano,
    directorio: env.VITE_MF_DIRECTORIO_URL || remoteDefaults.directorio,
  };

  const remoteEntries = Object.fromEntries(
    Object.entries(remotes)
      .filter(([, url]) => Boolean(url))
      .map(([key, url]) => [
        key,
        { type: 'module', name: key === 'capitalHumano' ? 'capitalHumano' : key, entry: url },
      ])
  );

  return {
    plugins: [
      react(),
      tailwindcss(),
      federation({
        name: 'shell',
        remotes: remoteEntries,
        shared: mfShared,
        dts: false,
      }),
    ],
    resolve: { alias: workspaceAliases() },
    server: {
      port: devPort,
      host: true,
      strictPort: tunnelDev,
      allowedHosts: true,
      ...(tunnelDev
        ? { hmr: { protocol: 'wss', clientPort: 443 } }
        : {}),
      proxy: {
        '/api': {
          target: apiTarget,
          changeOrigin: true,
          ws: true,
          agent: apiProxyAgent,
          timeout: 120_000,
        },
        '/assets/formats': { target: apiTarget, changeOrigin: true, agent: apiProxyAgent },
      },
    },
    build: {
      target: 'esnext',
      minify: true,
    },
  };
}
