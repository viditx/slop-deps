// H-2 verification: run the REAL (fixed) site scanner on a Python file with stdlib imports
import { inspectDroppedFileAsync } from '../../slop-deps-fixed/site/morpho/src/utils/fileInspector.ts';

const pySrc = `import os
import sys
import json
import re
from pathlib import Path
import requests
import fakepkg_torch_magic_404
import { fileURLToPath } from 'node:url';
const __FIXED__DIR__ = fileURLToPath(new URL('../../slop-deps-fixed', import.meta.url));
`;

const record = await inspectDroppedFileAsync('app.py', pySrc.length, pySrc, 'verify-1');
console.log('=== FIXED site scanner verdicts (app.py drop) ===');
for (const p of record.packages) {
  console.log(`  ${p.name.padEnd(28)} verdict=${p.verdict.padEnd(12)} reason=${p.reason || ''}`);
}
const bad = record.packages.filter(p => (p.name === 'os' || p.name === 'sys' || p.name === 'json' || p.name === 're' || p.name === 'pathlib') && p.verdict === 'HALLUCINATED');
const good = record.packages.filter(p => p.name === 'fakepkg_torch_magic_404' && p.verdict === 'HALLUCINATED');
console.log('');
console.log(bad.length === 0 ? 'PASS: stdlib modules are NOT flagged as HALLUCINATED anymore' : 'FAIL: stdlib still flagged!');
console.log(good.length === 1 ? 'PASS: real hallucination still caught correctly' : 'FAIL: real hallucination missed!');
process.exit(bad.length === 0 && good.length === 1 ? 0 : 1);
