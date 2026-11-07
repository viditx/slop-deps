// RED TEAM probe: symlink sandbox escape via ?dir=<symlink-inside-root>
// Note: --ui dashboard server was removed from v1.4.0 (Card F-07).
import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const FIXED = fileURLToPath(new URL('../..', import.meta.url));
const serverFile = path.join(FIXED, 'src', 'server.js');

if (!fs.existsSync(serverFile)) {
  console.log('SKIP: --ui dashboard server was intentionally stripped from v1.4.0 (Card F-07).');
  process.exit(0);
}

const { spawn } = await import('child_process');
const os = (await import('os')).default;
const SERVER_URL = pathToFileURL(serverFile).href;

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'rt5-'));
fs.writeFileSync(path.join(ROOT, 'app.js'), `import lodash from 'lodash';\n`);
const SECRET_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'rt5-secret-'));
fs.writeFileSync(path.join(SECRET_DIR, 'leakme.py'), `import os\nimport requests\nimport super_evil_404_pkg\n`);
const link = path.join(ROOT, 'docs-link');
try { fs.symlinkSync(SECRET_DIR, link); } catch { /* Windows non-admin symlink skip */ }

const BOOT = path.join(os.tmpdir(), 'slop-deps-redteam-boot5.mjs');
fs.writeFileSync(BOOT, `
import { startDashboardServer } from ${JSON.stringify(SERVER_URL)};
const { server, port } = await startDashboardServer({ port: 0, rootDir: ${JSON.stringify(ROOT)} });
console.log('PORT=' + port);
`);

const { child, port } = await new Promise((resolve) => {
  const c = spawn('node', ['--experimental-strip-types', BOOT], { stdio: ['ignore', 'pipe', 'pipe'] });
  c.stdout.on('data', (d) => { const m = String(d).match(/PORT=(\d+)/); if (m) resolve({ child: c, port: +m[1] }); });
});
child.kill();
