import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  base: '/',                    // GitHub Pages 必須加這行
  build: {
    outDir: 'dist',
    assetsDir: 'assets'
  }
})
