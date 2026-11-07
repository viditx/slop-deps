// Differential test: ORIGINAL isInsideJsxOrBlock (from git HEAD) vs the new
// single-pass buildJsxContexts. Verdicts must be 100% identical.
import { execSync } from 'child_process';
import { extractJsImports } from '../../src/extractors/js-ts.js';
import { fileURLToPath } from 'node:url';
const __FIXED__DIR__ = fileURLToPath(new URL('../..', import.meta.url));

// --- original implementation, verbatim from git HEAD ---
const TS_PRIMITIVES = new Set(['void', 'string', 'number', 'boolean', 'any', 'never', 'unknown', 'symbol', 'bigint', 'object']);
function isInsideJsxOrBlock(code, matchIndex, isStatic = true) {
  let braceDepth = 0;
  for (let i = 0; i < matchIndex; i++) {
    const ch = code[i];
    if (ch === '{') braceDepth++;
    else if (ch === '}' && braceDepth > 0) braceDepth--;
  }
  if (isStatic && braceDepth > 0) return true;
  const openTags = [];
  let lastTagEnd = 0;
  let i = 0;
  while (i < matchIndex) {
    const ch = code[i];
    if (ch === '<') {
      const prev = i > 0 ? code[i - 1] : ' ';
      if (/[a-zA-Z0-9_$]/.test(prev)) { i++; continue; }
      const isClose = code[i + 1] === '/';
      const nameStart = isClose ? i + 2 : i + 1;
      let nameEnd = nameStart;
      while (nameEnd < matchIndex && /[a-zA-Z0-9_.:-]/.test(code[nameEnd])) nameEnd++;
      const tagName = code.slice(nameStart, nameEnd);
      if (!tagName || !/^[a-zA-Z]/.test(tagName) || TS_PRIMITIVES.has(tagName.toLowerCase())) { i++; continue; }
      let j = nameEnd;
      let exprDepth = 0;
      let isSelfClose = false;
      let isInvalid = false;
      while (j < matchIndex) {
        const tCh = code[j];
        if (tCh === '{') exprDepth++;
        else if (tCh === '}' && exprDepth > 0) exprDepth--;
        else if (exprDepth === 0) {
          if (/[;?\(\)\[\]+*%]/.test(tCh)) { isInvalid = true; break; }
          if (tCh === '>') { if (code[j - 1] === '/') isSelfClose = true; break; }
        }
        j++;
      }
      if (isInvalid || j >= matchIndex) { i = isInvalid ? nameStart : j; continue; }
      if (!isSelfClose && !isClose) {
        let afterGt = j + 1;
        while (afterGt < matchIndex && /\s/.test(code[afterGt])) afterGt++;
        if (code[afterGt] === '(' || code[afterGt] === ',') { i = nameStart; continue; }
      }
      lastTagEnd = j + 1;
      if (isSelfClose) { i = j + 1; continue; }
      if (isClose) {
        if (openTags.length > 0 && openTags[openTags.length - 1] === tagName) openTags.pop();
      } else {
        openTags.push(tagName);
      }
      i = j + 1;
      continue;
    }
    i++;
  }
  const lastOpen = openTags[openTags.length - 1];
  if (lastOpen && lastOpen.toLowerCase() !== 'script') {
    let exprDepthAfterTag = 0;
    for (let k = lastTagEnd; k < matchIndex; k++) {
      if (code[k] === '{') exprDepthAfterTag++;
      else if (code[k] === '}' && exprDepthAfterTag > 0) exprDepthAfterTag--;
    }
    if (exprDepthAfterTag > 0) return false;
    return true;
  }
  return false;
}

// --- pull the PATTERNS + maskStrings from the new module via export probe ---
// (extractJsImports already uses them; we need raw access. Rebuild via module import trick:)
// We import the module source and eval the pieces we need.
const src = await import('node:fs').then(fs => fs.readFileSync(__FIXED__DIR__ + '/src/extractors/js-ts.js', 'utf-8'));
// extract PATTERNS + maskStrings by evaluating the module with exports stripped
const moduleBody = src.replace(/^export /gm, '');
const probe = new Function(moduleBody + `\nreturn { PATTERNS, maskStrings, cleanPackageName };`)();
const { PATTERNS, maskStrings } = probe;

// --- new implementation under test (already imported above uses it internally);
// access buildJsxContexts the same way ---
const probe2 = new Function(moduleBody + `\nreturn { buildJsxContexts, isInsideJsxOrBlockFromSnapshot };`)();
const { buildJsxContexts, isInsideJsxOrBlockFromSnapshot } = probe2;

// --- corpus ---
const fs = await import('node:fs');
const path = await import('node:path');
const corpus = [];
const walk = (dir) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === '.git' || e.name === 'node_modules' || e.name === 'dist') continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (/\.(js|mjs|cjs|ts|tsx|jsx|vue|svelte|astro)$/i.test(e.name)) corpus.push(p);
  }
};
walk(__FIXED__DIR__ + '');

// synthetic adversarial cases
const synthetic = [
  `import a from 'pkg-a';\nconst C = () => <div class="x">hi <b>{import('pkg-b')}</b></div>;\n`,
  `function f() { if (x) { import x from 'pkg-in-block'; } }\n`,
  `const t = a <b > c;\nimport real from 'pkg-real';\n`,
  `<template><div><script>import v from 'pkg-vue';</script></div></template>`,
  `type A<T> = (x: T) => void;\nconst g = <T,>(v: T) => v;\nimport gen from 'pkg-gen';\n`,
  `const s = "import fake from 'pkg-str'";\nconst r = /import x from 'pkg-re'/;\nimport ok from 'pkg-ok';\n`,
  `render(<Comp a={1} b={[2]}/>, root);\nimport after from 'pkg-after';\n`,
  `const html = \`<div><span>text</span>\${x}</div>\`;\nimport tmpl from 'pkg-tmpl';\n`,
  `let a=b<c>d>e; const f = a<b>>c;\nimport cmp from 'pkg-cmp';\n`,
  `x = <div>{items.map(i => <Row key={i}/>)}</div>;\nimport deep from 'pkg-deep';\n`,
  `/* <div> */ import commented from 'pkg-c'; // <b>\n`,
  `a < string > b; import ts1 from 'pkg-ts1';\n`,
  `<script>import one from 'pkg-s1';</script><div>import two from 'pkg-s2';</div>`,
  `const A = () => (\n  <div>\n    {block && <span>import x from 'pkg-jsx-str';</span>}\n  </div>\n);\nimport outside from 'pkg-out';\n`,
  `f(a, <Comp/>, b); import arg from 'pkg-arg';\n`,
  `if (a<b) { require('pkg-req'); }\n`,
  `const arrow = <T>(x: T) => x; import afterArrow from 'pkg-aa';\n`,
  `<div\n  className={cls}\n  onClick={() => go()}\n>text</div>\nimport attrs from 'pkg-attrs';\n`,
  `a = b < c ? d : e; import ternary from 'pkg-tern';\n`,
  `while (i<n) { i++; } import loop from 'pkg-loop';\n`,
  // nested / pathological
  `<a><b><c><d>{x}</d></c></b></a>` + `import nested from 'pkg-n';`,
  `<<T>()>0>`, // garbage
  `const x = a < b, c > d; import comma from 'pkg-comma';`,
];
let totalChecks = 0, mismatches = 0;
const check = (code, label) => {
  const { masked } = maskStrings(code);
  for (let p = 0; p < PATTERNS.length; p++) {
    const re = PATTERNS[p];
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(masked)) !== null) {
      for (const isStatic of [true, false]) {
        const oldV = isInsideJsxOrBlock(masked, m.index, isStatic);
        const snap = buildJsxContexts(masked, [m.index]).get(m.index);
        const newV = isInsideJsxOrBlockFromSnapshot(snap, isStatic);
        totalChecks++;
        if (oldV !== newV) {
          mismatches++;
          if (mismatches <= 5) {
            console.log(`MISMATCH [${label}] pattern=${p} idx=${m.index} static=${isStatic} old=${oldV} new=${newV}`);
            console.log('  ctx:', JSON.stringify(code.slice(Math.max(0, m.index - 40), m.index + 40)));
          }
        }
      }
    }
  }
};
for (const f of corpus) check(fs.readFileSync(f, 'utf-8'), path.basename(f));
for (let s = 0; s < synthetic.length; s++) check(synthetic[s], `synthetic-${s}`);

// end-to-end: old extractJsImports output vs new module output on every corpus file
let pkgMismatch = 0;
const oldExtract = (code, filePath) => {
  const packages = new Map();
  const { masked, strings } = maskStrings(code);
  for (let pIdx = 0; pIdx < PATTERNS.length; pIdx++) {
    const regex = PATTERNS[pIdx];
    const isStatic = pIdx < 2;
    regex.lastIndex = 0;
    let match;
    while ((match = regex.exec(masked)) !== null) {
      if (isInsideJsxOrBlock(masked, match.index, isStatic)) continue;
      const rawSpec = (match[1].replace(/[\uE000](\d+)[\uE001]/g, (_, i) => strings[+i] ?? '')).trim();
      if (rawSpec.includes('${')) continue;
      // reuse cleanPackageName via probe
      const pkg = probe.cleanPackageName ? probe.cleanPackageName(rawSpec) : null;
      if (pkg && !packages.has(pkg)) packages.set(pkg, { name: pkg, line: masked.slice(0, match.index + 1).split('\n').length, raw: rawSpec });
    }
  }
  return Array.from(packages.values());
};
for (const f of corpus) {
  const code = fs.readFileSync(f, 'utf-8');
  const norm = (arr) => JSON.stringify(arr.map(x => x.name + ':' + x.line + ':' + x.raw));
  const oldOut = norm(oldExtract(code, f));
  const newOut = norm(extractJsImports(code, f));
  if (oldOut !== newOut) {
    pkgMismatch++;
    if (pkgMismatch <= 3) { console.log('PKG MISMATCH in', f); }
  }
}

// perf check: 3MB adversarial blob
{
  let blob = '';
  for (let k = 0; k < 6000; k++) blob += `import m${k} from 'pkg-${k}'; const c${k}=<div class="x">{m${k}}<b>${k}</b></div>; const q${k}=a<b>c>d; `;
  blob += `import tail from 'pkg-tail';`;
  const t0 = Date.now();
  const out = extractJsImports(blob, 'blob.js');
  const ms = Date.now() - t0;
  console.log(`\nPERF: ${(blob.length / 1e6).toFixed(1)}MB / ${blob.match(/import/g).length} imports extracted in ${ms}ms (${out.length} pkgs)`);
}

console.log(`\n=== DIFFERENTIAL: ${totalChecks} verdict checks, ${mismatches} mismatches ===`);
console.log(`=== END-TO-END: ${corpus.length} files, ${pkgMismatch} file-level output mismatches ===`);
process.exit(mismatches === 0 && pkgMismatch === 0 ? 0 : 1);
