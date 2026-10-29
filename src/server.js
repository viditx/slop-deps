// Local dashboard server — zero dependencies, binds 127.0.0.1 only.
// slop-deps --ui boots this and serves web/dashboard.html with a live scan API.

import http from 'http';
import path from 'path';
import os from 'os';
import { promises as fs } from 'fs';
import { fileURLToPath } from 'url';
import { scanDirectory, scanStagedFiles } from './index.js';
import { toSarif } from './sarif.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DASHBOARD = path.join(__dirname, '..', 'web', 'dashboard.html');
const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
const MAX_UPLOAD_FILES = 50;

async function readJsonBody(req) {
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_UPLOAD_BYTES) {
      const error = new Error('Upload is limited to 5 MB.');
      error.code = 'EUPLOADSIZE';
      throw error;
    }
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

function safeUploadPath(name) {
  const normalized = String(name || '').replace(/\\/g, '/').replace(/^\/+/, '');
  if (!normalized || normalized.split('/').some(part => !part || part === '..')) return null;
  const clean = path.posix.normalize(normalized);
  return clean === '.' || clean.startsWith('../') || path.posix.isAbsolute(clean) ? null : clean;
}

async function scanUploadedFiles(files) {
  if (!Array.isArray(files) || files.length === 0 || files.length > MAX_UPLOAD_FILES) {
    const error = new Error(`Upload between 1 and ${MAX_UPLOAD_FILES} files.`);
    error.code = 'EUPLOADFILES';
    throw error;
  }
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'slop-deps-upload-'));
  try {
    for (const file of files) {
      const relative = safeUploadPath(file?.name);
      if (!relative || typeof file?.content !== 'string') {
        const error = new Error('Each upload must contain a safe file name and text content.');
        error.code = 'EUPLOADFILE';
        throw error;
      }
      const destination = path.join(tempDir, relative);
      const relativeCheck = path.relative(tempDir, destination);
      if (!relativeCheck || relativeCheck.startsWith('..') || path.isAbsolute(relativeCheck)) {
        const error = new Error('Upload path must remain inside the temporary workspace.');
        error.code = 'EUPLOADPATH';
        throw error;
      }
      await fs.mkdir(path.dirname(destination), { recursive: true });
      await fs.writeFile(destination, file.content, 'utf8');
    }
    return await scanDirectory(tempDir, { allowConfig: false });
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}

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

    if (req.method === 'POST' && url.pathname === '/api/scan-upload') {
      try {
        const payload = await readJsonBody(req);
        const result = await scanUploadedFiles(payload.files);
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify(result));
      } catch (err) {
        res.writeHead(400, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ error: err.message, code: err.code || 'EUPLOAD' }));
      }
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
