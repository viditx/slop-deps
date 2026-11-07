// RED TEAM v2: full live attack suite against the dashboard server
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
const net = (await import('net')).default;
const os = (await import('os')).default;
const SERVER_URL = pathToFileURL(serverFile).href;

const ROOT = path.join(os.tmpdir(), 'slop-deps-redteam-target');
fs.rmSync(ROOT, { recursive: true, force: true });
fs.mkdirSync(ROOT, { recursive: true });
fs.writeFileSync(path.join(ROOT, 'evil.js'),
  `import x from 'rea<x><img src=x onerror=alert(1)>ct';\nimport y from 'lodash';\n`);

const BOOT = path.join(os.tmpdir(), 'slop-deps-redteam-boot.mjs');
fs.writeFileSync(BOOT, `
import { startDashboardServer } from ${JSON.stringify(SERVER_URL)};
const { server, port } = await startDashboardServer({ port: 0, rootDir: ${JSON.stringify(ROOT)} });
console.log('PORT=' + port);
`);

let child = null, port = 0;
const boot = () => new Promise((resolve) => {
  child = spawn('node', ['--experimental-strip-types', BOOT], { stdio: ['ignore', 'pipe', 'pipe'] });
  child.stdout.on('data', (d) => {
    const m = String(d).match(/PORT=(\d+)/);
    if (m) { port = +m[1]; resolve(); }
  });
});
await boot();
console.log('Live server on port', port);
child.kill();
