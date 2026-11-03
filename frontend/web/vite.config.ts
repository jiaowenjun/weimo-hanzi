import react, { reactCompilerPreset } from '@vitejs/plugin-react'
import babel from '@rolldown/plugin-babel'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    babel({ presets: [reactCompilerPreset()] })
  ],
  build: {
    rollupOptions: {
      // 多页入口：主全景页 + 覆盖热力图 + 文本缺字检测（dev server 天然服务各 .html）
      input: {
        main: 'index.html',
        coverage: 'coverage.html',
        check: 'check.html',
      },
    },
  },
})
