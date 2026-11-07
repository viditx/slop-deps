// Fuzz differential: random code from a grammar of tricky constructs,
// original vs single-pass must agree 100%.
import fs from 'fs';
import { fileURLToPath as __futp } from 'node:url';
const __FIXED__DIR__ = __futp(new URL('../..', import.meta.url));

const src = fs.readFileSync(__FIXED__DIR__ + '/src/extractors/js-ts.js', 'utf-8').replace(/^export /gm, '');
const probe = new Function(src + '\nreturn { PATTERNS, maskStrings, cleanPackageName, unmask, buildJsxContexts, isInsideJsxOrBlockFromSnapshot };')();
const { PATTERNS, maskStrings, buildJsxContexts, isInsideJsxOrBlockFromSnapshot } = probe;

const TS_PRIMITIVES = new Set(['void', 'string', 'number', 'boolean', 'any', 'never', 'unknown', 'symbol', 'bigint', 'object']);
function isInsideJsxOrBlock(code, matchIndex, isStatic = true) {
  let braceDepth = 0;
  for (let i = 0; i < matchIndex; i++) {
    const ch = code[i];
    if (ch === '{') braceDepth++;
    else if (ch === '}' && braceDepth > 0) braceDepth--;
  }
  if (isStatic && braceDepth > 0) return true;
  const openTags = []; let lastTagEnd = 0; let i = 0;
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
      let j = nameEnd; let exprDepth = 0; let isSelfClose = false; let isInvalid = false;
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
      if (isClose) { if (openTags.length > 0 && openTags[openTags.length - 1] === tagName) openTags.pop(); }
      else openTags.push(tagName);
      i = j + 1; continue;
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

// PRNG with fixed seed for reproducibility
let seed = 0xC0FFEE;
const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
const maybe = (p) => rnd() < p;

const frags = [
  () => `import m${Math.floor(rnd() * 50)} from 'pkg${Math.floor(rnd() * 20)}';`,
  () => `require('pkg${Math.floor(rnd() * 20)}')`,
  () => `import('dyn${Math.floor(rnd() * 10)}')`,
  () => `{`,
  () => `}`,
  () => `<div>`, () => `</div>`, () => `<span className="x">`, () => `</span>`,
  () => `<Comp a={1} b={[2]}/>`,
  () => `<T>(v: T) => v`,
  () => `a < b`, () => `c > d`, () => `x<y>z`,
  () => `if (a) {`, () => `} else {`, () => `}`,
  () => `f(a, b);`,
  () => `const s = "text with <div> and { brace";`,
  () => `\`tpl \${x} <b>\``,
  () => `// comment <div> { import no from 'nope';\n`,
  () => `<script>`, () => `</script>`,
  () => `<b:${'x'}>`,
  () => `a<b>c>d`,
  () => `x = p << 2 >> 1;`,
  () => `\n`,
  () => `let v${Math.floor(rnd() * 30)} = ${Math.floor(rnd() * 100)};`,
  () => `jest.mock('jm${Math.floor(rnd() * 5)}')`,
];

let total = 0, bad = 0;
const ROUNDS = 3000, LEN = 40;
for (let r = 0; r < ROUNDS; r++) {
  let code = '';
  for (let k = 0; k < LEN; k++) code += pick(frags)() + (maybe(0.4) ? ' ' : '\n');
  const { masked } = maskStrings(code);
  const all = [];
  for (let p = 0; p < PATTERNS.length; p++) {
    const re = PATTERNS[p]; re.lastIndex = 0; let m;
    while ((m = re.exec(masked)) !== null) all.push({ index: m.index, isStatic: p < 2, p });
  }
  if (!all.length) continue;
  const combined = buildJsxContexts(masked, all.map(x => x.index));
  for (const m of all) {
    for (const st of [true, false]) {
      const oldV = isInsideJsxOrBlock(masked, m.index, st);
      const snap = combined.get(m.index);
      const newV = snap ? isInsideJsxOrBlockFromSnapshot(snap, st) : undefined;
      total++;
      if (oldV !== newV) {
        bad++;
        if (bad <= 4) {
          console.log(`FUZZ DIFF round=${r} pattern=${m.p} idx=${m.index} static=${st} old=${oldV} new=${newV}`);
          fs.writeFileSync(`/tmp/fuzzfail-${bad}.js`, code);
          console.log('  saved /tmp/fuzzfail-' + bad + '.js  ctx:', JSON.stringify(masked.slice(Math.max(0, m.index - 50), m.index + 50)));
        }
      }
    }
  }
}
console.log(`\n=== FUZZ: ${total} verdicts compared, ${bad} mismatches over ${ROUNDS} random files ===`);
process.exit(bad ? 1 : 0);
