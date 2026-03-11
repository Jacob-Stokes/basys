import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 3000,
    watch: {
      usePolling: true
    },
    allowedHosts: process.env.VITE_ALLOWED_HOSTS
      ? process.env.VITE_ALLOWED_HOSTS.split(',').map((host) => host.trim()).filter(Boolean)
      : [],
    proxy: process.env.VITE_PROXY_TARGET ? {
      '/api': { target: process.env.VITE_PROXY_TARGET, changeOrigin: true, ws: true }
    } : undefined
  }
})
