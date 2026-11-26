import fs from 'node:fs';
import path from 'node:path';
import { defineConfig, type Plugin } from 'vite';

const CUSTOM_PACK_PREFIX = '/__krunked_custom_pack__/';
const CUSTOM_PACK_DIR_NAME = '.krunked-cards-assets';

const MIME_TYPES: Record<string, string> = {
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.ogg': 'audio/ogg',
  '.ttf': 'font/ttf',
  '.fs': 'text/plain; charset=utf-8',
  '.glsl': 'text/plain; charset=utf-8',
};

/**
 * Dev-server-only middleware that serves local gitignored assets from
 * `<root>/.krunked-cards-assets/*` under `/__krunked_custom_pack__/*`.
 * Restricted to `apply: 'serve'` so extracted assets are NEVER bundled or
 * copied into `dist/` during `vite build`.
 */
function krunkedCustomPackDevPlugin(): Plugin {
  return {
    name: 'krunked-custom-pack-dev',
    apply: 'serve',
    configureServer(server) {
      const rootDir = server.config.root || process.cwd();
      const assetsDir = path.resolve(rootDir, CUSTOM_PACK_DIR_NAME);

      server.middlewares.use((req, res, next) => {
        const rawUrl = req.url ?? '';
        if (!rawUrl.startsWith(CUSTOM_PACK_PREFIX)) {
          next();
          return;
        }

        if (!fs.existsSync(assetsDir)) {
          res.statusCode = 404;
          res.setHeader('Content-Type', 'text/plain; charset=utf-8');
          res.end('Custom asset pack not available');
          return;
        }

        const pathname = rawUrl.split('?')[0] ?? '';
        let relPath: string;
        try {
          relPath = decodeURIComponent(pathname.slice(CUSTOM_PACK_PREFIX.length));
        } catch {
          res.statusCode = 400;
          res.end('Bad Request');
          return;
        }

        const resolvedPath = path.resolve(assetsDir, relPath);
        if (
          resolvedPath !== assetsDir &&
          !resolvedPath.startsWith(assetsDir + path.sep)
        ) {
          res.statusCode = 403;
          res.end('Forbidden');
          return;
        }

        let stat: fs.Stats;
        try {
          stat = fs.statSync(resolvedPath);
        } catch {
          res.statusCode = 404;
          res.setHeader('Content-Type', 'text/plain; charset=utf-8');
          res.end('Not Found');
          return;
        }

        if (!stat.isFile()) {
          res.statusCode = 404;
          res.setHeader('Content-Type', 'text/plain; charset=utf-8');
          res.end('Not Found');
          return;
        }

        const ext = path.extname(resolvedPath).toLowerCase();
        res.statusCode = 200;
        res.setHeader('Content-Type', MIME_TYPES[ext] ?? 'application/octet-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Content-Length', String(stat.size));
        fs.createReadStream(resolvedPath).pipe(res);
      });
    },
  };
}

export default defineConfig({
  base: './',
  plugins: [krunkedCustomPackDevPlugin()],
  build: {
    outDir: 'dist',
    target: 'es2022',
    emptyOutDir: true,
  },
});
