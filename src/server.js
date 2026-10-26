// Local dashboard server — zero dependencies, binds 127.0.0.1 only.
// slop-deps --ui boots this and serves web/dashboard.html with a live scan API.

import http from 'http';
import path from 'path';
import { promises as fs } from 'fs';
import { fileURLToPath } from 'url';
import { scanDirectory, scanStagedFiles } from './index.js';
import { toSarif } from './sarif.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DASHBOARD = path.join(__dirname, '..', 'web', 'dashboard.html');

export function startDashboardServer({ port = 0, rootDir = process.cwd(), open } = {}) {
  let scanning = null;

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1');

    if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/index.html')) {
      try {
        const html = await fs.readFile(DASHBOARD, 'utf-8');
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
        res.end(html);
      } catch {
        res.writeHead(500, { 'content-type': 'text/plain' });
        res.end('dashboard.html not found');
      }
      return;
    }

    if (req.method === 'GET' && url.pathname === '/api/scan') {
      const dir = url.searchParams.get('dir') || rootDir;
      const staged = url.searchParams.get('staged') === '1';
      const format = url.searchParams.get('format');
      if (scanning) {
        res.writeHead(429, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ error: 'A scan is already running' }));
        return;
      }
      scanning = (async () => {
        const target = path.resolve(rootDir, dir);
        const relative = path.relative(rootDir, target);
        if (relative.startsWith('..') || path.isAbsolute(relative)) {
          const error = new Error('Scan directory must remain inside the dashboard root.');
          error.code = 'EACCESS';
          throw error;
        }
        const result = staged
          ? await scanStagedFiles(target, { allowConfig: false })
          : await scanDirectory(target, { allowConfig: false });
        if (format === 'sarif') return { sarif: toSarif(result.findings) };
        return result;
      })()
        .then((payload) => {
          res.writeHead(200, { 'content-type': 'application/json' });
          res.end(JSON.stringify(payload));
        })
        .catch((err) => {
          res.writeHead(400, { 'content-type': 'application/json' });
          res.end(JSON.stringify({ error: err.message, code: err.code || 'ESCAN' }));
        })
        .finally(() => { scanning = null; });
      return;
    }

    res.writeHead(404, { 'content-type': 'text/plain' });
    res.end('not found');
  });

  return new Promise((resolve) => {
    server.listen(port, '127.0.0.1', () => {
      const address = server.address();
      resolve({
        server,
        port: address.port,
        url: `http://127.0.0.1:${address.port}`,
        close: () => new Promise((done) => server.close(done)),
        open,
      });
    });
  });
}
