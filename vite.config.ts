import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath, URL } from 'node:url'
import { createLive2dServePlugin } from './vite-plugin-live2d-serve'

export default defineConfig({
  base: '/live2d-viewer/',
  plugins: [vue(), tailwindcss(), createLive2dServePlugin()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
})
