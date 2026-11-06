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

function isInsideJsxOrBlock(code, matchIndex, isStatic = true) {
  let braceDepth = 0;
  for (let i = 0; i < matchIndex; i++) {
    const ch = code[i];
    if (ch === '{') braceDepth++;
    else if (ch === '}' && braceDepth > 0) braceDepth--;
  }

  // Static imports and exports are syntactically illegal inside blocks or functions
  if (isStatic && braceDepth > 0) return true;

  // Track unclosed JSX/HTML tags up to match index
  const openTags = [];
  let lastTagEnd = 0;
  let i = 0;
  while (i < matchIndex) {
    const ch = code[i];
    if (ch === '<') {
      const prev = i > 0 ? code[i - 1] : ' ';
      if (/[a-zA-Z0-9_$]/.test(prev)) {
        i++;
        continue;
      }

      const isClose = code[i + 1] === '/';
      const nameStart = isClose ? i + 2 : i + 1;
      let nameEnd = nameStart;
      while (nameEnd < matchIndex && /[a-zA-Z0-9_.:-]/.test(code[nameEnd])) {
        nameEnd++;
      }

      const tagName = code.slice(nameStart, nameEnd);
      if (!tagName || !/^[a-zA-Z]/.test(tagName) || TS_PRIMITIVES.has(tagName.toLowerCase())) {
        i++;
        continue;
      }

      let j = nameEnd;
      let exprDepth = 0;
      let isSelfClose = false;
      let isInvalid = false;

      while (j < matchIndex) {
        const tCh = code[j];
        if (tCh === '{') exprDepth++;
        else if (tCh === '}' && exprDepth > 0) exprDepth--;
        else if (exprDepth === 0) {
          // In JSX attributes, ;, ?, (, ), [, ], +, *, % outside { } indicate JS code (not a tag)
          if (/[;?\(\)\[\]+*%]/.test(tCh)) {
            isInvalid = true;
            break;
          }
          if (tCh === '>') {
            if (code[j - 1] === '/') isSelfClose = true;
            break;
          }
        }
        j++;
      }

      if (isInvalid || j >= matchIndex) {
        i = isInvalid ? nameStart : j;
        continue;
      }

      // Generic arrow function or type parameter, e.g. <T>(v: T) => ...
      if (!isSelfClose && !isClose) {
        let afterGt = j + 1;
        while (afterGt < matchIndex && /\s/.test(code[afterGt])) afterGt++;
        if (code[afterGt] === '(' || code[afterGt] === ',') {
          i = nameStart;
          continue;
        }
      }

      lastTagEnd = j + 1;

      if (isSelfClose) {
        i = j + 1;
        continue;
      }

      if (isClose) {
        if (openTags.length > 0 && openTags[openTags.length - 1] === tagName) {
          openTags.pop();
        }
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
    // If inside an active embedded expression brace { ... } after the tag opened, it is executable JS code!
    let exprDepthAfterTag = 0;
    for (let k = lastTagEnd; k < matchIndex; k++) {
      if (code[k] === '{') exprDepthAfterTag++;
      else if (code[k] === '}' && exprDepthAfterTag > 0) exprDepthAfterTag--;
    }
    if (exprDepthAfterTag > 0) {
      return false;
    }
    return true;
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

export function extractJsImports(sourceCode, filePath = '') {
  const packages = new Map();
  const { masked, strings } = maskStrings(sourceCode);

  for (let pIdx = 0; pIdx < PATTERNS.length; pIdx++) {
    const regex = PATTERNS[pIdx];
    const isStatic = pIdx < 2;
    regex.lastIndex = 0;
    let match;

    while ((match = regex.exec(masked)) !== null) {
      if (isInsideJsxOrBlock(masked, match.index, isStatic)) {
        continue;
      }

      const rawSpec = unmask(match[1], strings).trim();
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
          line: masked.slice(0, match.index + 1).split('\n').length,
          raw: rawSpec
        });
      }
    }
  }

  return Array.from(packages.values());
}
