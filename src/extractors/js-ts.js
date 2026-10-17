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
    trimmed.startsWith('#') ||
    trimmed.startsWith('@/') ||
    trimmed.startsWith('$')    // SvelteKit $app, $lib, $env
  ) {
    return null;
  }

  // URL / virtual-scheme imports (https:, http:, data:, bun:, jsr:, astro:, etc.) are not registry packages
  if (/^[a-zA-Z][\w+.-]*:/.test(trimmed) && !trimmed.startsWith('node:')) {
    return null;
  }

  // Handle scoped packages: @org/pkg/sub -> @org/pkg
  if (trimmed.startsWith('@')) {
    const parts = trimmed.split('/');
    if (parts.length >= 2) {
      return `${parts[0]}/${parts[1]}`;
    }
    return trimmed;
  }

  // Handle regular packages: lodash/merge -> lodash
  return trimmed.split('/')[0];
}

const PH_START = '\uE000';
const PH_END = '\uE001';

// Mask string literal contents so import patterns never see text inside
// strings ("const s = \"import x from 'y'\"") while keeping quoted specifiers
// recoverable via placeholders. Newlines inside strings are re-emitted after
// the placeholder so line numbers of following code stay accurate.
function maskStrings(code) {
  const strings = [];
  let out = '';
  let i = 0;
  let str = null;

  while (i < code.length) {
    const ch = code[i];

    if (str) {
      if (ch === '\\') {
        strings[strings.length - 1] += ch + (code[i + 1] ?? '');
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

    if (ch === '/' && code[i + 1] === '/') {
      while (i < code.length && code[i] !== '\n') i++;
      continue;
    }

    if (ch === '/' && code[i + 1] === '*') {
      const end = code.indexOf('*/', i + 2);
      const stop = end === -1 ? code.length : end + 2;
      out += '\n'.repeat((code.slice(i, stop).match(/\n/g) || []).length);
      i = stop;
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

// Patterns run over the whole masked file, so multi-line statements match.
const PATTERNS = [
  // import/export ... from 'pkg' (default, named, mixed, namespace, type)
  /(?:^|[;\s}])(?:import|export)\s+(?:type\s+)?(?:\*\s*(?:as\s+[\w$]+)?|[\w$]+(?:\s*,\s*(?:\{[^{}]*\}|\*\s*as\s+[\w$]+))?|\{[^{}]*\})\s*from\s*['"]([^'"]+)['"]/g,
  // side-effect import: import 'pkg'
  /(?:^|[;\s])import\s*['"]([^'"]+)['"]/g,
  // require('pkg') in any expression position
  /(?:^|[^\w.$])require\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  // dynamic import: import('pkg')
  /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g
];

export function extractJsImports(sourceCode, filePath = '') {
  const packages = new Map();
  const { masked, strings } = maskStrings(sourceCode);

  for (const regex of PATTERNS) {
    regex.lastIndex = 0;
    let match;
    while ((match = regex.exec(masked)) !== null) {
      const spec = unmask(match[1], strings).trim();
      const pkg = cleanPackageName(spec);
      if (pkg && !packages.has(pkg)) {
        packages.set(pkg, {
          name: pkg,
          ecosystem: 'npm',
          file: filePath,
          line: masked.slice(0, match.index).split('\n').length,
          raw: spec
        });
      }
    }
  }

  return Array.from(packages.values());
}
