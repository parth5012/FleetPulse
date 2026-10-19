import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  root: '.',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://127.0.0.1:8000',
      '/antigravity': 'http://127.0.0.1:8000',
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
  },
});