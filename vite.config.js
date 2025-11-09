import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  base: '/te/',   // ← 這裡改成你庫的真實名稱！（例如 my-idle-game）
  build: {
    outDir: 'dist',
    assetsDir: 'assets'
  }
})
