import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import * as path from 'node:path';
import * as fs from 'node:fs';

/**
 * Copies the static extension assets (manifest + icons) into the build
 * output directory after the bundle is written. Vite only emits the files it
 * bundles, so the manifest and icon set have to be copied explicitly for the
 * `dist/` folder to be a loadable unpacked extension.
 */
function copyExtensionAssets(): Plugin {
  const root = __dirname;
  return {
    name: 'unslop:copy-extension-assets',
    apply: 'build',
    closeBundle() {
      const outDir = path.resolve(root, 'dist');
      fs.mkdirSync(outDir, { recursive: true });

      fs.copyFileSync(
        path.resolve(root, 'manifest.json'),
        path.resolve(outDir, 'manifest.json'),
      );

      const iconsSrc = path.resolve(root, 'icons');
      if (fs.existsSync(iconsSrc)) {
        const iconsOut = path.resolve(outDir, 'icons');
        fs.mkdirSync(iconsOut, { recursive: true });
        for (const file of fs.readdirSync(iconsSrc)) {
          fs.copyFileSync(
            path.resolve(iconsSrc, file),
            path.resolve(iconsOut, file),
          );
        }
      }
    },
  };
}

/**
 * Main build: React UI pages (popup + options) and the background service
 * worker. The content script is built separately (see vite.content.config.ts)
 * because MV3 content scripts run as classic scripts and cannot import ESM
 * chunks at runtime — it must be a single self-contained IIFE bundle.
 */
export default defineConfig({
  base: './',
  plugins: [react(), copyExtensionAssets()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: false,
    target: 'es2022',
    modulePreload: false,
    rollupOptions: {
      input: {
        popup: path.resolve(__dirname, 'popup.html'),
        options: path.resolve(__dirname, 'options.html'),
        background: path.resolve(__dirname, 'src/background/serviceWorker.ts'),
      },
      output: {
        format: 'es',
        // The service worker must keep a stable filename because the manifest
        // references it directly. Everything else can be content-hashed.
        entryFileNames: (chunk) =>
          chunk.name === 'background' ? 'background.js' : 'assets/[name]-[hash].js',
        chunkFileNames: 'chunks/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash].[ext]',
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
});
