import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// API requests go through the dev server, so they are same-origin on whatever port Vite picks.
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/companies': 'http://localhost:3000',
      '/filings': 'http://localhost:3000',
    },
  },
})
