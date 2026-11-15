/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: { port: 5171, strictPort: false },
  // Pre-bundle only what the app's index.html imports. By default Vite scans every .html in the repo, and
  // pitch/farm-stills/render-src/scene.html imports `three`, which the app does not install: the scan then fails,
  // pre-bundling is skipped and React breaks in the dev server (e2e only; `vite build` reads index.html alone).
  optimizeDeps: { entries: ['index.html'] },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test-setup.ts'],
    include: ['src/**/*.test.{ts,tsx}', 'scripts/**/*.test.ts'],
    css: false,
  },
});
