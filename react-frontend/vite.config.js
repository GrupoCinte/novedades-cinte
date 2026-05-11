import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  /** Debe coincidir con `PORT` del backend (por defecto 3005). */
  const apiTarget = (env.VITE_API_PROXY_TARGET || 'http://localhost:3005').trim()
  const devPort = Number(env.VITE_DEV_SERVER_PORT || 5175) || 5175

  return {
    plugins: [react(), tailwindcss()],
    server: {
      port: devPort,
      /** Evita que Vite quede solo en [::1] en Windows; cloudflared usa 127.0.0.1 y sin esto devuelve 502. */
      host: true,
      strictPort: false,
      allowedHosts: true,
      proxy: {
        '/api': { target: apiTarget, changeOrigin: true, ws: true },
        '/assets': { target: apiTarget, changeOrigin: true }
      }
    }
  }
})
