import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5175,
    allowedHosts: true,
    proxy: {
      '/api': { target: 'http://localhost:3005', changeOrigin: true },
      '/assets': { target: 'http://localhost:3005', changeOrigin: true }
    }
  }
})
