/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // Cloudflare / localtunnel quick hosts change every deploy.
    allowedHosts: true,
    proxy: {
      '/api': {
        // Must match the live API (8002). Do not point at the stale :8000 listener.
        target: process.env.VITE_BACKEND_URL || 'http://127.0.0.1:8002',
        changeOrigin: true,
      },
    },
  },
  test: {
    environment: 'jsdom',
    globals: false,
    css: false,
    setupFiles: ['./src/test/setup.ts'],
  },
})
