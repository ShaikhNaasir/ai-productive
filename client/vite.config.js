/// <reference types="vitest" />
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';
import fs from 'fs';

// import.meta.dirname rather than __dirname: Vite 8's native config loader does not
// provide the CJS globals.
const rootDir = import.meta.dirname;

// Stamp a per-build id into the service worker's cache name. Without it the cache
// name is constant, the activate handler's cleanup never matches anything, and each
// deploy's content-hashed assets accumulate in Cache Storage indefinitely.
function swBuildId() {
  const buildId = Date.now().toString(36);
  return {
    name: 'sw-build-id',
    apply: 'build',
    closeBundle() {
      const swPath = path.resolve(rootDir, 'dist/sw.js');
      if (!fs.existsSync(swPath)) return;
      const src = fs.readFileSync(swPath, 'utf8');
      fs.writeFileSync(swPath, src.replace(/__BUILD_ID__/g, buildId));
    },
  };
}

// Vite 8 bundles with rolldown, where manualChunks must be a function — the old
// object form is rejected at build time.
const VENDOR_CHUNKS = [
  { name: 'react', match: /[\\/]node_modules[\\/](react|react-dom|react-router|react-router-dom|scheduler)[\\/]/ },
  { name: 'charts', match: /[\\/]node_modules[\\/](recharts|d3-[^\\/]+|victory-vendor|internmap|robust-predicates|delaunator)[\\/]/ },
];

function manualChunks(id) {
  if (!id.includes('node_modules')) return undefined;
  const hit = VENDOR_CHUNKS.find((c) => c.match.test(id));
  return hit ? hit.name : undefined;
}

export default defineConfig({
  plugins: [react(), swBuildId()],
  resolve: {
    alias: {
      '@': path.resolve(rootDir, './src'),
    },
  },
  server: {
    port: 5173,
  },
  build: {
    rollupOptions: {
      output: { manualChunks },
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/test/setup.js',
  },
});
