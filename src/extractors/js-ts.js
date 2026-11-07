function cleanPackageName(specifier) {
  if (!specifier) return null;
  let trimmed = specifier.trim();

  // Strip query parameters and hash fragments (e.g. 'three?raw', 'pkg?worker', 'file.wasm?init')
  const qIdx = trimmed.search(/[?#]/);
  if (qIdx !== -1) {
    trimmed = trimmed.slice(0, qIdx).trim();
  }

  if (!trimmed) return null;

  // Ignore relative and path aliases
  if (
    trimmed.startsWith('.') ||
    trimmed.startsWith('/') ||
    trimmed.startsWith('~') ||
    trimmed.startsWith('~~') || // Nuxt root alias
    trimmed.startsWith('#') ||
    trimmed.startsWith('@/') ||
    trimmed.startsWith('@@') || // Nuxt root alias
    trimmed.startsWith('$')     // SvelteKit $app, $lib, $env
  ) {
    return null;
  }

  // Handle Deno/Bun/Node 'npm:' specifier prefix: npm:pkg@^1.0.0 or npm:@org/pkg@^1.0.0
  if (trimmed.startsWith('npm:')) {
    trimmed = trimmed.slice(4).trim();
    if (trimmed.startsWith('@')) {
      const parts = trimmed.split('/');
      if (parts.length >= 2) {
        const pkgPart = parts[1].split('@')[0];
        return `${parts[0]}/${pkgPart}`;
      }
    } else {
      return trimmed.split('/')[0].split('@')[0];
    }
  }

  // URL / virtual-scheme imports (https:, http:, data:, bun:, jsr:, astro:, etc.) are not registry packages
  if (/^[a-zA-Z][\w+.-]*:/.test(trimmed) && !trimmed.startsWith('node:')) {
    return null;
  }

  // Handle scoped packages: @org/pkg/sub -> @org/pkg
  if (trimmed.startsWith('@')) {
    const parts = trimmed.split('/');
    if (parts.length >= 2 && parts[1].trim()) {
      return `${parts[0]}/${parts[1]}`;
    }
    return null;
  }

  // Handle regular packages: lodash/merge -> lodash
  return trimmed.split('/')[0];
}

const PH_START = '\uE000';
const PH_END = '\uE001';

function isRegexStart(code, i) {
  let j = i - 1;
  while (j >= 0 && /\s/.test(code[j])) j--;
  if (j < 0) return true;
  const prev = code[j];
  if (/[=,;:(\[{!&|?+\-*%^~<>]/.test(prev)) return true;
  let wordEnd = j;
  while (j >= 0 && /[a-zA-Z0-9_$]/.test(code[j])) j--;
  const word = code.slice(j + 1, wordEnd + 1);
  return /^(?:return|case|throw|yield|await|typeof|void|delete|instanceof|in|of)$/.test(word);
}

// Mask string literal contents so import patterns never see text inside
// strings ("const s = \"import x from 'y'\"") while keeping quoted specifiers
// recoverable via placeholders. Newlines inside strings are re-emitted after
// the placeholder so line numbers of following code stay accurate.
function maskStrings(code) {
  const strings = [];
  let out = '';
  let i = 0;
  let str = null;
  const templateStack = [];

  while (i < code.length) {
    const ch = code[i];

    if (str) {
      if (ch === '\\') {
        strings[strings.length - 1] += ch + (code[i + 1] ?? '');
        i += 2;
        continue;
      }
      if (str === '`' && ch === '$' && code[i + 1] === '{') {
        templateStack.push({ braceDepth: 1 });
        out += '\n'.repeat((strings[strings.length - 1].match(/\n/g) || []).length);
        out += '${';
        str = null;
        i += 2;
        continue;
      }
      if (ch === str) {
        out += '\n'.repeat((strings[strings.length - 1].match(/\n/g) || []).length) + ch;
        str = null;
        i++;
        continue;
      }
      strings[strings.length - 1] += ch;
      i++;
      continue;
    }

    if (templateStack.length > 0) {
      if (ch === '{') {
        templateStack[templateStack.length - 1].braceDepth++;
      } else if (ch === '}') {
        templateStack[templateStack.length - 1].braceDepth--;
        if (templateStack[templateStack.length - 1].braceDepth === 0) {
          templateStack.pop();
          out += '}';
          str = '`';
          strings.push('');
          out += '`' + PH_START + (strings.length - 1) + PH_END;
          i++;
          continue;
        }
      }
    }

    if (ch === '/' && code[i + 1] === '/') {
      while (i < code.length && code[i] !== '\n') i++;
      continue;
    }

    if (ch === '/' && code[i + 1] === '*') {
      const end = code.indexOf('*/', i + 2);
      const stop = end === -1 ? code.length : end + 2;
      const nlCount = (code.slice(i, stop).match(/\n/g) || []).length;
      out += nlCount > 0 ? '\n'.repeat(nlCount) : ' ';
      i = stop;
      continue;
    }

    // Handle regex literals so quotes inside regex character classes (e.g. /['"]/) never trigger string mode
    // and braces inside regexes (e.g. /[{]/ or /\{/) never corrupt block brace counter
    if (ch === '/' && isRegexStart(code, i)) {
      out += ch;
      i++;
      let inClass = false;
      while (i < code.length) {
        const rCh = code[i];
        if (rCh === '\\') {
          const esc = code.slice(i, i + 2);
          out += esc.replace(/[{}]/g, '_');
          i += 2;
          continue;
        }
        if (rCh === '\n') break;
        if (rCh === '[') inClass = true;
        else if (rCh === ']' && inClass) inClass = false;
        else if (rCh === '/' && !inClass) {
          out += rCh;
          i++;
          while (i < code.length && /[a-z]/i.test(code[i])) {
            out += code[i];
            i++;
          }
          break;
        }
        out += (rCh === '{' || rCh === '}') ? '_' : rCh;
        i++;
      }
      continue;
    }

    if (ch === '"' || ch === "'" || ch === '`') {
      str = ch;
      strings.push('');
      out += ch + PH_START + (strings.length - 1) + PH_END;
      i++;
      continue;
    }

    out += ch;
    i++;
  }

  return { masked: out, strings };
}

function unmask(text, strings) {
  return text.replace(new RegExp(PH_START + '(\\d+)' + PH_END, 'g'), (_, i) => strings[+i] ?? '');
}

const TS_PRIMITIVES = new Set([
  'void', 'string', 'number', 'boolean', 'any', 'never', 'unknown', 'symbol', 'bigint', 'object'
]);

// Single-pass evaluation of "is this regex match inside a JSX element or a
// nested block?" for every match in a file. The previous per-match scan was
// O(file × matches) — pathological on large/minified bundles (a red-team
// perf-DoS vector). This walks the file exactly once, snapshots the analyzer
// state at each match index, and returns verdict-identical results (proven
// by differential testing against the original per-match implementation).
function buildJsxContexts(code, matchIndices) {
  const pending = [...new Set(matchIndices)]
    .filter((ix) => Number.isInteger(ix) && ix >= 0 && ix <= code.length)
    .sort((a, b) => a - b);
  const snapshots = new Map();
  let pi = 0;

  let outerBraceDepth = 0;   // braces seen outside any tag scan (block depth)
  const openTags = [];       // completed, still-open JSX tag names
  const rawBraceStack = [];  // positions of currently-open braces, any mode
  let lastTagEnd = 0;

  const takeSnapshot = (idx) => {
    const lastOpen = openTags.length ? openTags[openTags.length - 1] : null;
    // Net open-brace count in [lastTagEnd, idx) — a positional stack gives the
    // same answer as the original's raw re-scan of that window.
    let exprAfterTag = 0;
    for (let k = rawBraceStack.length - 1; k >= 0 && rawBraceStack[k] >= lastTagEnd; k--) exprAfterTag++;
    snapshots.set(idx, { braceDepth: outerBraceDepth, lastOpen, exprAfterTag });
  };
  const flushUpTo = (pos) => {
    while (pi < pending.length && pending[pi] <= pos) takeSnapshot(pending[pi++]);
  };

  let i = 0;
  while (i < code.length) {
    flushUpTo(i);
    const ch = code[i];

    if (ch === '{') {
      outerBraceDepth++;
      rawBraceStack.push(i);
      i++;
      continue;
    }
    if (ch === '}') {
      if (outerBraceDepth > 0) outerBraceDepth--;
      if (rawBraceStack.length) rawBraceStack.pop();
      i++;
      continue;
    }

    if (ch === '<') {
      const prev = i > 0 ? code[i - 1] : ' ';
      if (/[a-zA-Z0-9_$]/.test(prev)) { i++; continue; }

      const isClose = code[i + 1] === '/';
      const nameStart = isClose ? i + 2 : i + 1;
      let nameEnd = nameStart;
      while (nameEnd < code.length && /[a-zA-Z0-9_.:-]/.test(code[nameEnd])) nameEnd++;
      const tagName = code.slice(nameStart, nameEnd);
      if (!tagName || !/^[a-zA-Z]/.test(tagName) || TS_PRIMITIVES.has(tagName.toLowerCase())) { i++; continue; }

      // Tag names contain no braces: every index up to nameEnd - 1 saw the
      // same frozen state, so one flush covers them all.
      flushUpTo(nameEnd - 1);

      const rawBracesBeforeScan = rawBraceStack.slice();
      let j = nameEnd;
      let exprDepth = 0;
      let isSelfClose = false;
      let isInvalid = false;
      while (j < code.length) {
        flushUpTo(j);
        const tCh = code[j];
        if (tCh === '{') {
          exprDepth++;
          rawBraceStack.push(j);
        } else if (tCh === '}') {
          if (exprDepth > 0) exprDepth--;
          if (rawBraceStack.length) rawBraceStack.pop();
        } else if (exprDepth === 0) {
          // In JSX attributes, ;, ?, (, ), [, ], +, *, % outside { } indicate JS code (not a tag)
          if (/[;?\(\)\[\]+*%]/.test(tCh)) { isInvalid = true; break; }
          if (tCh === '>') {
            if (code[j - 1] === '/') isSelfClose = true;
            break;
          }
        }
        j++;
      }

      // Invalid or unterminated tags are re-scanned as plain code from
      // nameStart (exactly like the original). Brace mutations made during
      // this scan must be rolled back first — the re-scan re-counts them.
      if (isInvalid || j >= code.length) {
        rawBraceStack.length = 0;
        rawBraceStack.push(...rawBracesBeforeScan);
        i = isInvalid ? nameStart : j;
        continue;
      }

      // Generic arrow function or type parameter, e.g. <T>(v: T) => ...
      // (original skips the lastTagEnd/push bookkeeping for these)
      if (!isSelfClose && !isClose) {
        let afterGt = j + 1;
        while (afterGt < code.length && /\s/.test(code[afterGt])) afterGt++;
        if (code[afterGt] === '(' || code[afterGt] === ',') {
          rawBraceStack.length = 0;
          rawBraceStack.push(...rawBracesBeforeScan);
          i = nameStart;
          continue;
        }
      }

      // Snapshots at indices <= j must NOT see this tag as closed; from j+1
      // on, it is (mirrors the original's j < matchIndex bound).
      flushUpTo(j);
      lastTagEnd = j + 1;

      if (isSelfClose) { flushUpTo(j + 1); i = j + 1; continue; }
      if (isClose) {
        if (openTags.length > 0 && openTags[openTags.length - 1] === tagName) openTags.pop();
      } else {
        openTags.push(tagName);
      }
      flushUpTo(j + 1);
      i = j + 1;
      continue;
    }

    i++;
  }
  flushUpTo(code.length);
  return snapshots;
}

// Decision function, identical to the original's per-match logic, evaluated
// against a snapshot taken by buildJsxContexts.
function isInsideJsxOrBlockFromSnapshot(snap, isStatic) {
  if (isStatic && snap.braceDepth > 0) return true;
  if (snap.lastOpen && snap.lastOpen.toLowerCase() !== 'script') {
    // If inside an active embedded expression brace { ... } after the tag
    // opened, it is executable JS code!
    return snap.exprAfterTag > 0 ? false : true;
  }
  return false;
}

// Patterns run over the whole masked file, so multi-line statements match.
const PATTERNS = [
  // 0: import/export ... from 'pkg' (handles standard, type, namespace, and minified without space)
  /(?:^|[;\s}])(?:import|export)(?:\s+(?:type\s+)?(?:[\w$]+(?:\s*,\s*(?:\{[^{}]*\}|\*\s*as\s+[\w$]+))?|\*\s*(?:as\s+[\w$]+)?|\{[^{}]*\})|\s*(?:type\s*)?(?:\{[^{}]*\}|\*\s*(?:as\s+[\w$]+)?))\s*from\s*['"]([^'"]+)['"]/g,
  // 1: side-effect import: import 'pkg'
  /(?:^|[;\s])import\s*['"]([^'"]+)['"]/g,
  // 2: require('pkg') and require.resolve('pkg', ...) in any expression position
  /(?:^|[^\w.$])require(?:\.resolve)?\s*\(\s*['"`]([^'"`]+)['"`]\s*[,)]/g,
  // 3: dynamic import: import('pkg', ...) and import.meta.resolve('pkg', ...)
  /\bimport(?:\.meta\.resolve)?\s*\(\s*['"`]([^'"`]+)['"`]\s*[,)]/g,
  // 4: test framework module mocks: jest.mock('pkg'), vi.mock('pkg'), etc.
  /(?:^|[^\w.$])(?:jest|vi)\.(?:mock|requireActual|requireMock|importActual)\s*\(\s*['"`]([^'"`]+)['"`]\s*[,)]/g
];

function getLineNumber(newlineOffsets, target) {
  let low = 0;
  let high = newlineOffsets.length;
  while (low < high) {
    const mid = (low + high) >>> 1;
    if (newlineOffsets[mid] < target) {
      low = mid + 1;
    } else {
      high = mid;
    }
  }
  return low + 1;
}

export function extractJsImports(sourceCode, filePath = '') {
  const packages = new Map();
  const { masked, strings } = maskStrings(sourceCode);

  const newlineOffsets = [];
  let pos = masked.indexOf('\n');
  while (pos !== -1) {
    newlineOffsets.push(pos);
    pos = masked.indexOf('\n', pos + 1);
  }

  // Collect every regex match first, then evaluate all JSX/block contexts in
  // ONE pass over the file (O(file) instead of O(file × matches)).
  const allMatches = [];
  for (let pIdx = 0; pIdx < PATTERNS.length; pIdx++) {
    const regex = PATTERNS[pIdx];
    const isStatic = pIdx < 2;
    regex.lastIndex = 0;
    let match;
    while ((match = regex.exec(masked)) !== null) {
      allMatches.push({ index: match.index, spec: match[1], isStatic });
    }
  }
  const contexts = buildJsxContexts(masked, allMatches.map((m) => m.index));

  for (const m of allMatches) {
    const snap = contexts.get(m.index);
    if (snap && isInsideJsxOrBlockFromSnapshot(snap, m.isStatic)) {
      continue;
    }

    const rawSpec = unmask(m.spec, strings).trim();
    // Skip template literals with dynamic interpolation
    if (rawSpec.includes('${')) {
      continue;
    }

    const pkg = cleanPackageName(rawSpec);
    if (pkg && !packages.has(pkg)) {
      packages.set(pkg, {
        name: pkg,
        ecosystem: 'npm',
        file: filePath,
        // +1: separator-consuming patterns (leading \n, ;, etc.) start the match
        // one char before the keyword, so include it when counting newlines
        line: getLineNumber(newlineOffsets, m.index + 1),
        raw: rawSpec
      });
    }
  }

  return Array.from(packages.values());
}
