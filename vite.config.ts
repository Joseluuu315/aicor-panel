import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/webhook': {
        target: 'https://n8n.averonix.org',
        changeOrigin: true,
        secure: true,
      }
    }
  }
})