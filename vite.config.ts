import { resolve } from 'node:path';
import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  build: {
    outDir: 'dist',
    assetsDir: 'demo/assets',
    emptyOutDir: true,
    sourcemap: true,
    rollupOptions: {
      input: {
        root: resolve(import.meta.dirname, 'index.html'),
        demo: resolve(import.meta.dirname, 'demo/index.html'),
      },
    },
  },
  server: { port: 4173, strictPort: false },
});
