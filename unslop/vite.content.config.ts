import { defineConfig } from 'vite';
import * as path from 'node:path';

/**
 * Dedicated build for the content script.
 *
 * MV3 content scripts declared in the manifest are executed as *classic*
 * scripts, so they cannot use `import`/`export` at runtime. We therefore build
 * the content entry as a single self-contained IIFE bundle with all of its
 * dependencies inlined. `emptyOutDir` is disabled so this build appends to the
 * output produced by the main (pages + background) build.
 */
export default defineConfig({
  base: './',
  build: {
    outDir: 'dist',
    emptyOutDir: false,
    sourcemap: false,
    target: 'es2022',
    rollupOptions: {
      input: {
        contentScript: path.resolve(__dirname, 'src/content/contentScript.ts'),
      },
      output: {
        format: 'iife',
        name: 'UnslopContent',
        inlineDynamicImports: true,
        entryFileNames: 'contentScript.js',
        assetFileNames: 'assets/content-[name]-[hash].[ext]',
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
});
