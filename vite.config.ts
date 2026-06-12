import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// https://vite.dev/config/
export default defineConfig({
  base: '/miracle-health/',

  root: path.resolve(__dirname, 'frontend'),
  plugins: [react()],
  server: {
    proxy: {
      "/api": {
        //target: "http://localhost:8080",
        target: "https://miracle-health-729237515205.us-west2.run.app",
        changeOrigin: true,
      },
    },
  },

  build: {
    outDir: path.resolve(__dirname, 'dist'),
    emptyOutDir: true,
  }
})
