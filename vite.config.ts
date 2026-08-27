import { defineConfig } from 'vite';

export default defineConfig({
  base: '/mediapipe-samples-web/',

  plugins: [],
  optimizeDeps: {
    exclude: ['@mediapipe/tasks-vision'],
  },
  worker: {
    format: 'es'
  },
  server: {
    port: 5173,
    strictPort: false,
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp'
    }
  },
  preview: {
    port: 4173,
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp'
    }
  }
});
