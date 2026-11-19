// Rust source extraction: `use` paths and `extern crate` declarations.
// Local paths (crate::, self::, super::) never reference registry crates.

const USE_PATH = /(?:^|[;\s}])(?:pub(?:\([^)]*\))?\s+)?use\s+([a-zA-Z_][a-zA-Z0-9_]*)/g;
const EXTERN_CRATE = /(?:^|[;\s}])(?:#\[[^\]]*\]\s*)?(?:pub\s+)?extern\s+crate\s+([a-zA-Z_][a-zA-Z0-9_]*)/g;
const LOCAL_ROOTS = new Set(['crate', 'self', 'super']);
// Toolchain-shipped crates — never registry dependencies
const STD_ROOTS = new Set(['std', 'core', 'alloc', 'proc_macro', 'test', 'bench']);

export function extractRustUses(sourceCode, filePath = '') {
  const packages = new Map();

  for (const regex of [USE_PATH, EXTERN_CRATE]) {
    regex.lastIndex = 0;
    let match;
    while ((match = regex.exec(sourceCode)) !== null) {
      const root = match[1];
      if (!root || LOCAL_ROOTS.has(root) || STD_ROOTS.has(root.toLowerCase())) continue;

      const key = root.toLowerCase();
      if (!packages.has(key)) {
        const lineStart = sourceCode.lastIndexOf('\n', match.index) + 1;
        const lineEnd = sourceCode.indexOf('\n', match.index);
        packages.set(key, {
          name: root,
          ecosystem: 'cargo',
          file: filePath,
          line: sourceCode.slice(0, match.index + 1).split('\n').length,
          raw: sourceCode.slice(lineStart, lineEnd === -1 ? sourceCode.length : lineEnd).trim()
        });
      }
    }
  }

  // Detect Rust #[path = ...] custom module file declarations
  const RUST_PATH_ATTR = /#\[\s*path\s*=\s*([^\]]+)\]\s*(?:pub\s+)?mod\s+([a-zA-Z_][a-zA-Z0-9_]*)/g;
  let pMatch;
  while ((pMatch = RUST_PATH_ATTR.exec(sourceCode)) !== null) {
    const key = `unknown:path:${pMatch.index}`;
    if (!packages.has(key)) {
      const lineStart = sourceCode.lastIndexOf('\n', pMatch.index) + 1;
      const lineEnd = sourceCode.indexOf('\n', pMatch.index);
      packages.set(key, {
        name: `mod ${pMatch[2]} (path = ${pMatch[1].trim()})`,
        ecosystem: 'cargo',
        file: filePath,
        line: sourceCode.slice(0, pMatch.index + 1).split('\n').length,
        raw: sourceCode.slice(lineStart, lineEnd === -1 ? sourceCode.length : lineEnd).trim(),
        status: 'UNKNOWN',
        risk: 'WARN',
        exists: null,
        message: `Statically unresolvable Rust module path: #[path = ${pMatch[1].trim()}]`
      });
    }
  }

  // Detect Rust macro-generated use or mod declarations
  const RUST_MACRO_USE = /(?:^|[;\s}])(?:pub\s+)?(?:use|mod)\s+([a-zA-Z_][a-zA-Z0-9_]*!\s*[\(\{\[])/g;
  let mMatch;
  while ((mMatch = RUST_MACRO_USE.exec(sourceCode)) !== null) {
    const key = `unknown:macro:${mMatch.index}`;
    if (!packages.has(key)) {
      const lineStart = sourceCode.lastIndexOf('\n', mMatch.index) + 1;
      const lineEnd = sourceCode.indexOf('\n', mMatch.index);
      packages.set(key, {
        name: mMatch[1].trim(),
        ecosystem: 'cargo',
        file: filePath,
        line: sourceCode.slice(0, mMatch.index + 1).split('\n').length,
        raw: sourceCode.slice(lineStart, lineEnd === -1 ? sourceCode.length : lineEnd).trim(),
        status: 'UNKNOWN',
        risk: 'WARN',
        exists: null,
        message: `Macro-generated module or import path: ${mMatch[1].trim()}`
      });
    }
  }

  return Array.from(packages.values());
}
