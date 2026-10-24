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

  return Array.from(packages.values());
}
