import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // Les appels /api passent par Vite : même origine, donc les cookies JWT fonctionnent sans souci
    proxy: {
      '/api': 'http://localhost:4000',
    },
  },
})
