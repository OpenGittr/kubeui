import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 4600,
    strictPort: true,
    proxy: {
      '/api': {
        target: 'http://localhost:4610',
        changeOrigin: true,
        ws: true,
      },
    },
  },
})
