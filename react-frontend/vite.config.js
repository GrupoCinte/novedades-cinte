import { defineConfig, loadEnv } from 'vite'
import http from 'node:http'
import https from 'node:https'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

/** Conexiones persistentes hacia el backend: menos `ECONNRESET` en el proxy al guardar/HMR seguidos. */
function createApiProxyAgent(targetUrl) {
  const t = String(targetUrl || '').trim()
  const opts = { keepAlive: true, keepAliveMsecs: 30_000, maxSockets: 80, maxFreeSockets: 20 }
  return t.startsWith('https:') ? new https.Agent(opts) : new http.Agent(opts)
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  /** Debe coincidir con `PORT` del backend (por defecto 3005). */
  const apiTarget = (env.VITE_API_PROXY_TARGET || 'http://localhost:3005').trim()
  const apiProxyAgent = createApiProxyAgent(apiTarget)
  const devPort = Number(env.VITE_DEV_SERVER_PORT || 5175) || 5175
  const tunnelDev =
    env.VITE_TUNNEL_DEV === '1' ||
    String(env.VITE_TUNNEL_DEV || '').toLowerCase() === 'true'

  return {
    plugins: [react(), tailwindcss()],
    server: {
      port: devPort,
      /** Evita que Vite quede solo en [::1] en Windows; cloudflared usa 127.0.0.1 y sin esto devuelve 502. */
      host: true,
      /**
       * Con túnel Cloudflare, si el puerto cambia (p. ej. 5176) cloudflared sigue apuntando al 5175 → 502/530.
       * Activa `VITE_TUNNEL_DEV=true` para fijar puerto y HMR por wss:443 (mismo host que *.trycloudflare.com).
       */
      strictPort: tunnelDev,
      allowedHosts: true,
      ...(tunnelDev
        ? {
            hmr: {
              protocol: 'wss',
              clientPort: 443
            }
          }
        : {}),
      proxy: {
        '/api': {
          target: apiTarget,
          changeOrigin: true,
          ws: true,
          agent: apiProxyAgent,
          /** Rutas largas (p. ej. monitor contratación) sin cortar por tiempo del proxy. */
          timeout: 120_000
        },
        /** Solo plantillas en backend; logos/banner en `public/assets` los sirve Vite. */
        '/assets/formats': { target: apiTarget, changeOrigin: true, agent: apiProxyAgent }
      }
    }
  }
})
