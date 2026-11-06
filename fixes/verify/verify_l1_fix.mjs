// Verify L-1 (Host header guard) + regression: traversal still blocked, dashboard E2E still works
import { startDashboardServer } from '../../slop-deps-fixed/src/server.js';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'node:url';
const __FIXED__DIR__ = fileURLToPath(new URL('../../slop-deps-fixed', import.meta.url));

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fix-verify-'));
fs.writeFileSync(path.join(root, 'app.js'), "import lodash from 'lodash';\nimport reqeusts from 'reqeusts';\n");

const { server, port, url } = await startDashboardServer({ port: 0, rootDir: root });
console.log('dashboard:', url);

// 1. Foreign Host header -> 403
let res = await fetch(`${url}/api/scan`, { headers: { Host: 'evil.example.com' } });
console.log('[L-1] Host: evil.example.com ->', res.status, '(expect 403)');

// 2. Correct Host -> 200
res = await fetch(`${url}/api/scan`, { headers: { Host: `127.0.0.1:${port}` } });
const data = await res.json();
console.log('[L-1] Host: 127.0.0.1:' + port + ' ->', res.status, '| findings:', (data.findings || []).map(f => f.name + ':' + f.risk).join(', '));

// 3. localhost variant also allowed
res = await fetch(`${url}/api/scan`, { headers: { Host: `localhost:${port}` } });
console.log('[L-1] Host: localhost:' + port + ' ->', res.status, '(expect 200)');

// 4. Traversal regression check
res = await fetch(`${url}/api/scan?dir=${encodeURIComponent('../../etc')}`, { headers: { Host: `127.0.0.1:${port}` } });
console.log('[regression] traversal /etc ->', res.status, '(expect 400)');

server.close();
fs.rmSync(root, { recursive: true, force: true });
console.log('done');
process.exit(0);
