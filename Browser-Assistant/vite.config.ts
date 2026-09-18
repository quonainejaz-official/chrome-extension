import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { crx } from '@crxjs/vite-plugin';
import { resolve } from 'path';
import manifest from './manifest.json';

export default defineConfig({
  plugins: [
    react(),
    crx({
      manifest,
      // Keep CRXJS HMR/live reload enabled for extension development.
      liveReload: true,
    }),
  ],
  server: {
    // CRXJS service-worker loaders point at this origin in dev mode.
    // Keeping it stable prevents a stale loader from targeting another port.
    host: 'localhost',
    port: 5173,
    strictPort: true,
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
  build: {
    rollupOptions: {
      input: {
        sidepanel: resolve(__dirname, 'src/sidepanel/index.html'),
      },
    },
  },
});
