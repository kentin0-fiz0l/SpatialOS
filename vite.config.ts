import { defineConfig, type Plugin, type ViteDevServer, type PreviewServer } from 'vite';
import react from '@vitejs/plugin-react';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const MCP_TOKEN_FILE = process.env.MCP_TOKEN_FILE ?? path.join(here, 'mcp-server', '.mcp-token');

/**
 * Hands the page the MCP server's WebSocket token. The server writes it to a file on start;
 * serving it here means neither side needs configuration. Loopback callers only, since the
 * dev server listens on all interfaces (host: true).
 */
function mcpToken(): Plugin {
  const attach = (server: ViteDevServer | PreviewServer) => {
    server.middlewares.use('/mcp-token', (req, res) => {
      const remote = req.socket.remoteAddress ?? '';
      if (!['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(remote)) {
        res.statusCode = 403;
        res.end('loopback only');
        return;
      }
      try {
        const token = readFileSync(MCP_TOKEN_FILE, 'utf8').trim();
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Cache-Control', 'no-store');
        res.end(JSON.stringify({ token }));
      } catch {
        res.statusCode = 404;
        res.end('MCP server not running (no token file)');
      }
    });
  };
  return { name: 'mcp-token', configureServer: attach, configurePreviewServer: attach };
}

export default defineConfig({
  plugins: [react(), mcpToken()],
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
