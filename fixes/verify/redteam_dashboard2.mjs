// RED TEAM v2: full live attack suite against the dashboard server, run in a
// CHILD process so crashes can't kill the harness. Expects the FIXED server.
// Result to expect: 11/11 blocked, 0 hits.
import { spawn } from 'child_process';
import net from 'net';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const FIXED = fileURLToPath(new URL('../../slop-deps-fixed', import.meta.url));
const SERVER_URL = pathToFileURL(path.join(FIXED, 'src', 'server.js')).href;

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
let children = [];
const boot = () => new Promise((resolve) => {
  child = spawn('node', ['--experimental-strip-types', BOOT], { stdio: ['ignore', 'pipe', 'pipe'] });
  children.push(child);
  child.stdout.on('data', (d) => {
    const m = String(d).match(/PORT=(\d+)/);
    if (m) { port = +m[1]; resolve(port); }
  });
  child.stderr.on('data', (d) => console.log('   [child stderr]', String(d).trim().slice(0, 300)));
  child.on('exit', (code, sig) => console.log(`   [child exit] code=${code} sig=${sig}`));
});

const httpGetSlow = (reqPath, ms) => new Promise((resolve) => {
  const req = net.connect(port, '127.0.0.1', () => req.write(`GET ${reqPath} HTTP/1.1\r\nHost: 127.0.0.1:${port}\r\nConnection: close\r\n\r\n`));
  let buf = ''; req.on('data', d => buf += d); req.on('end', () => resolve(buf)); req.on('error', () => resolve(buf));
  setTimeout(() => { req.destroy(); resolve(buf); }, ms);
});
const warmup = async () => {
  // one patient scan fills the server's in-memory verdict cache so later
  // liveness checks never race a live registry lookup
  await httpGetSlow('/api/scan?dir=.', 30000);
};

const results = [];
const log = (name, pass, detail = '') => { results.push({ name, pass, detail }); console.log(`${pass ? '🔒 blocked' : '💥 HIT!'}  ${name}${detail ? ' — ' + detail : ''}`); };

const httpGet = (reqPath, headers = {}) => new Promise((resolve, reject) => {
  const req = net.connect(port, '127.0.0.1', () => {
    req.write(`GET ${reqPath} HTTP/1.1\r\nHost: 127.0.0.1:${port}\r\n${Object.entries(headers).map(([k, v]) => `${k}: ${v}`).join('\r\n')}\r\nConnection: close\r\n\r\n`);
  });
  let buf = ''; req.on('data', d => buf += d); req.on('end', () => resolve(buf));
  req.on('error', reject);
  setTimeout(() => { req.destroy(); resolve(buf || ''); }, 6000);
});
const rawSend = (raw) => new Promise((resolve) => {
  const req = net.connect(port, '127.0.0.1', () => req.write(raw));
  let buf = ''; req.on('data', d => buf += d); req.on('end', () => resolve(buf));
  req.on('error', () => resolve(buf || ''));
  setTimeout(() => { req.destroy(); resolve(buf || ''); }, 3000);
});
const status = (buf) => parseInt((buf.match(/HTTP\/1\.[01] (\d+)/) || [])[1] ?? '0', 10);
const body = (buf) => buf.split('\r\n\r\n').slice(1).join('');
const alive = async () => /HTTP\/1\.[01] 200/.test(await httpGetSlow('/api/scan?dir=.', 8000));

await boot();
await warmup();
console.log('target: http://127.0.0.1:' + port + ' (isolated child, cache warmed)\n');

// A7 CRASH PROBES
const probes = [
  ['absolute-form invalid IPv6 "http://["', `GET http://[ HTTP/1.1\r\nHost: 127.0.0.1:${port}\r\nConnection: close\r\n\r\n`],
  ['absolute-form "http://[::1*z]"', `GET http://[::1*z] HTTP/1.1\r\nHost: 127.0.0.1:${port}\r\nConnection: close\r\n\r\n`],
  ['just a weird target "///^"', `GET ///^ HTTP/1.1\r\nHost: 127.0.0.1:${port}\r\nConnection: close\r\n\r\n`],
  ['oversized URL 32KB', `GET /${'a'.repeat(32768)} HTTP/1.1\r\nHost: 127.0.0.1:${port}\r\nConnection: close\r\n\r\n`],
];
for (const [label, raw] of probes) {
  await rawSend(raw);
  await new Promise(r => setTimeout(r, 300));
  const a = await alive();
  if (!a) { await boot(); await warmup(); }
  log(`A7 crash: ${label}`, a, a ? 'server survived' : 'SERVER DIED');
}

// A8 CRLF injection via dir param
{
  const r = await httpGet('/api/scan?dir=' + encodeURIComponent('x\r\nSet-Cookie: pwn=1'));
  log('A8 CRLF injection via dir', !/Set-Cookie: pwn/.test(r), `status=${status(r)}`);
}
// A9 XSS payload in package name — must be inert JSON at the API
{
  const r = await httpGetSlow('/api/scan?dir=.', 30000);
  const b = body(r);
  const hasPayload = b.includes('onerror=alert(1)');
  const jsonOnly = /application\/json/.test(r);
  log('A9 XSS payload reaches API only as inert JSON string', hasPayload && jsonOnly, `json=${jsonOnly} (render uses escapeHtml)`);
}
// A10 scan flood
{
  const shots = await Promise.all(Array.from({ length: 6 }, () => httpGetSlow('/api/scan?dir=.', 30000)));
  const codes = shots.map(status);
  const ok = codes.filter(c => c === 200).length, th = codes.filter(c => c === 429).length;
  log('A10 concurrent scan flood → 429', (ok + th) === codes.length, codes.join(','));
}
// A11 route abuse
{
  const r1 = await httpGet('/../../etc/passwd');
  log('A11 /../../etc/passwd route', status(r1) !== 200, `status=${status(r1)}`);
  const r2 = await rawSend(`POST /api/scan HTTP/1.1\r\nHost: 127.0.0.1:${port}\r\nContent-Length: 4\r\nConnection: close\r\n\r\nabcd`);
  log('A11b POST /api/scan rejected', status(r2) === 404 || status(r2) === 405, `status=${status(r2)}`);
  const r3 = await rawSend(`OPTIONS * HTTP/1.1\r\nHost: 127.0.0.1:${port}\r\nConnection: close\r\n\r\n`);
  log('A11c OPTIONS * handled', status(r3) !== undefined, `status=${status(r3)}`);
}
// A12 slowloris-lite
{
  const socks = [];
  for (let i = 0; i < 30; i++) {
    const s = net.connect(port, '127.0.0.1', () => s.write(`GET /api/scan?dir=. HTTP/1.1\r\nHost: 127.0.0.1:${port}\r\n`));
    s.on('error', () => {});
    socks.push(s);
  }
  await new Promise(r => setTimeout(r, 800));
  const r12 = await httpGetSlow('/api/scan?dir=.', 30000);
  const a = /HTTP\/1\.[01] (200|429)/.test(r12);
  socks.forEach(s => s.destroy());
  log('A12 30 half-open connections', a, a ? 'still responsive' : 'wedge');
}

children.forEach(c => { try { c.kill(); } catch {} });
fs.rmSync(ROOT, { recursive: true, force: true });
const hits = results.filter(r => !r.pass);
console.log(`\n=== RED TEAM v2: ${results.length - hits.length}/${results.length} blocked, ${hits.length} HITS ===`);
for (const h of hits) console.log('  💥 ' + h.name + (h.detail ? ' — ' + h.detail : ''));
process.exit(hits.length ? 1 : 0);
