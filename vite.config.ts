import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@components': path.resolve(__dirname, './src/components'),
      '@services': path.resolve(__dirname, './src/services'),
      '@stores': path.resolve(__dirname, './src/stores'),
      '@types': path.resolve(__dirname, './src/types'),
      '@utils': path.resolve(__dirname, './src/utils'),
    },
  },
  server: {
    port: 5173,
    host: true,
    proxy: {
      // Watchdog approval/activity API (bound to loopback on the host). Same-origin for the
      // browser, so no CORS; override the target when the watchdog runs on the hub Pi.
      '/watchdog': {
        target: process.env.WATCHDOG_URL ?? 'http://127.0.0.1:8790',
        rewrite: (path) => path.replace(/^\/watchdog/, ''),
      },
    },
  },
  optimizeDeps: {
    exclude: ['@handtrack3d/core', '@handtrack3d/react', '@handtrack3d/three', '@handtrack3d/rapier'],
  },
});
