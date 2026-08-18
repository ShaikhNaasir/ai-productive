import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import fs from 'fs';

// Stamp a per-build id into the service worker's cache name. Without it the cache
// name is constant, the activate handler's cleanup never matches anything, and each
// deploy's content-hashed assets accumulate in Cache Storage indefinitely.
function swBuildId() {
  const buildId = Date.now().toString(36);
  return {
    name: 'sw-build-id',
    apply: 'build',
    closeBundle() {
      const swPath = path.resolve(__dirname, 'dist/sw.js');
      if (!fs.existsSync(swPath)) return;
      const src = fs.readFileSync(swPath, 'utf8');
      fs.writeFileSync(swPath, src.replace(/__BUILD_ID__/g, buildId));
    },
  };
}

export default defineConfig({
  plugins: [react(), swBuildId()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          react: ['react', 'react-dom', 'react-router-dom'],
          charts: ['recharts'],
        },
      },
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/test/setup.js',
  },
});
