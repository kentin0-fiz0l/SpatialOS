import { defineConfig, type Plugin, type ViteDevServer, type PreviewServer } from 'vite';
import react from '@vitejs/plugin-react';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const MCP_TOKEN_FILE = process.env.MCP_TOKEN_FILE ?? path.join(here, 'mcp-server', '.mcp-token');
const OPERATOR_KEY_FILE = process.env.WATCHDOG_OPERATOR_KEY_FILE ?? path.join(here, 'watchdog', 'data', 'operator-key');

/**
 * Hands the page a secret that a local service wrote to a file on start, so neither side
 * needs configuration. Loopback callers only, since the dev server listens on all
 * interfaces (host: true). Used for the MCP WebSocket token and the watchdog operator key.
 */
function localSecret(route: string, file: string, missing: string): Plugin {
  const attach = (server: ViteDevServer | PreviewServer) => {
    server.middlewares.use(route, (req, res) => {
      const remote = req.socket.remoteAddress ?? '';
      if (!['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(remote)) {
        res.statusCode = 403;
        res.end('loopback only');
        return;
      }
      try {
        const token = readFileSync(file, 'utf8').trim();
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Cache-Control', 'no-store');
        res.end(JSON.stringify({ token }));
      } catch {
        res.statusCode = 404;
        res.end(missing);
      }
    });
  };
  return { name: `local-secret${route}`, configureServer: attach, configurePreviewServer: attach };
}

export default defineConfig({
  plugins: [
    react(),
    localSecret('/mcp-token', MCP_TOKEN_FILE, 'MCP server not running (no token file)'),
    localSecret('/operator-key', OPERATOR_KEY_FILE, 'watchdog not running (no operator key file)'),
  ],
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
      // Agent runner (agent/runner.py), start/observe runs.
      '/runner': {
        target: process.env.AGENT_RUNNER_URL ?? 'http://127.0.0.1:8791',
        rewrite: (path) => path.replace(/^\/runner/, ''),
      },
    },
  },
  optimizeDeps: {
    exclude: ['@handtrack3d/core', '@handtrack3d/react', '@handtrack3d/three', '@handtrack3d/rapier'],
  },
});
