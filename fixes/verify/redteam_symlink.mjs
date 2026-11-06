// RED TEAM probe: symlink sandbox escape via ?dir=<symlink-inside-root>
// Expects the FIXED server to answer 4xx with zero leaked findings.
import { spawn } from 'child_process';
import net from 'net';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const FIXED = fileURLToPath(new URL('../../slop-deps-fixed', import.meta.url));
const SERVER_URL = pathToFileURL(path.join(FIXED, 'src', 'server.js')).href;

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'rt5-'));
fs.writeFileSync(path.join(ROOT, 'app.js'), `import lodash from 'lodash';\n`);
const SECRET_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'rt5-secret-'));
fs.writeFileSync(path.join(SECRET_DIR, 'leakme.py'), `import os\nimport requests\nimport super_evil_404_pkg\n`);
const link = path.join(ROOT, 'docs-link');
fs.symlinkSync(SECRET_DIR, link);
console.log('symlink created:', fs.existsSync(link) && fs.lstatSync(link).isSymbolicLink());

const BOOT = path.join(os.tmpdir(), 'slop-deps-redteam-boot5.mjs');
fs.writeFileSync(BOOT, `
import { startDashboardServer } from ${JSON.stringify(SERVER_URL)};
const { server, port } = await startDashboardServer({ port: 0, rootDir: ${JSON.stringify(ROOT)} });
console.log('PORT=' + port);
`);

const { child, port } = await new Promise((resolve) => {
  const child = spawn('node', ['--experimental-strip-types', BOOT], { stdio: ['ignore', 'pipe', 'pipe'] });
  child.stdout.on('data', (d) => { const m = String(d).match(/PORT=(\d+)/); if (m) resolve({ child, port: +m[1] }); });
  child.stderr.on('data', () => {});
  setTimeout(() => resolve({ child, port: 0 }), 8000);
});

const send = (raw, ms = 25000) => new Promise((resolve) => {
  const req = net.connect(port, '127.0.0.1', () => req.write(raw));
  let buf = ''; req.on('data', d => buf += d); req.on('end', () => resolve(buf)); req.on('error', () => resolve(buf));
  setTimeout(() => { req.destroy(); resolve(buf); }, ms);
});

const r = await send(`GET /api/scan?dir=docs-link HTTP/1.1\r\nHost: 127.0.0.1:${port}\r\nConnection: close\r\n\r\n`);
const status = (r.match(/HTTP\/1\.[01] (\d+)/) || [])[1];
const body = r.split('\r\n\r\n').slice(1).join('');
const leaked = body.includes('super_evil_404_pkg') || body.includes('leakme.py');
console.log(`A5 symlink escape: status=${status} LEAKED=${leaked}`);
console.log(leaked ? '💥 ESCAPED: scanner followed the symlink OUTSIDE rootDir' : '🔒 blocked');

const r2 = await send(`GET /api/scan?dir=${encodeURIComponent('docs-link/../..')} HTTP/1.1\r\nHost: 127.0.0.1:${port}\r\nConnection: close\r\n\r\n`);
console.log('A5b symlink+traversal combo:', (r2.match(/HTTP\/1\.[01] (\d+)/) || [])[1], '(expect 400)');

try { child.kill(); } catch {}
fs.rmSync(ROOT, { recursive: true, force: true });
fs.rmSync(SECRET_DIR, { recursive: true, force: true });
process.exit(leaked ? 1 : 0);
