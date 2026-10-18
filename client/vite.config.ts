import path from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  server: {
    // Les appels /api passent par Vite : même origine, donc les cookies JWT fonctionnent sans souci
    proxy: {
      '/api': 'http://localhost:4000',
    },
  },
})
