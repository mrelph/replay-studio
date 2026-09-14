import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import electron from 'vite-plugin-electron'
import renderer from 'vite-plugin-electron-renderer'
import path from 'path'
import fs from 'fs'

// Simple plugin to copy electron/preload.cjs to dist-electron/ on build
function copyPreload() {
  return {
    name: 'copy-preload',
    writeBundle() {
      const src = path.resolve(__dirname, 'electron/preload.cjs')
      const dest = path.resolve(__dirname, 'dist-electron/preload.cjs')
      fs.mkdirSync(path.dirname(dest), { recursive: true })
      fs.copyFileSync(src, dest)
    },
  }
}

// Vite's dev server injects an inline module preamble (React refresh) and an
// HMR websocket, neither of which the production CSP allows. Relax exactly
// those two directives, and only while serving.
function relaxCspForDev() {
  return {
    name: 'relax-csp-for-dev',
    apply: 'serve' as const,
    transformIndexHtml(html: string) {
      return html
        .replace("script-src 'self' 'wasm-unsafe-eval'", "script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'")
        .replace("connect-src 'self' blob: data:", "connect-src 'self' blob: data: ws: wss: http://localhost:* http://127.0.0.1:*")
    },
  }
}

export default defineConfig({
  plugins: [
    relaxCspForDev(),
    react(),
    electron([
      {
        entry: 'electron/main.ts',
        vite: {
          build: {
            outDir: 'dist-electron',
            rollupOptions: {
              output: {
                format: 'es',
              },
            },
          },
          plugins: [copyPreload()],
        },
      },
    ]),
    renderer(),
  ],
  build: {
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        manualChunks: {
          'onnx-runtime': ['onnxruntime-web'],
        },
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  optimizeDeps: {
    exclude: ['onnxruntime-web'],
  },
  assetsInclude: ['**/*.onnx'],
})
