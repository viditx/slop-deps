function cleanPackageName(specifier) {
  if (!specifier) return null;
  const trimmed = specifier.trim();

  // Ignore relative and path aliases
  if (
    trimmed.startsWith('.') ||
    trimmed.startsWith('/') ||
    trimmed.startsWith('~') ||
    trimmed.startsWith('#') ||
    trimmed.startsWith('@/')
  ) {
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

export function extractJsImports(sourceCode, filePath = '') {
  const packages = new Map();

  // 1. Strip block comments /* ... */ while preserving newlines
  const codeWithoutBlockComments = sourceCode.replace(/\/\*[\s\S]*?\*\//g, (match) => {
    return '\n'.repeat((match.match(/\n/g) || []).length);
  });

  const lines = codeWithoutBlockComments.split('\n');

  // Regex patterns targeting actual statements, not string literals
  const PATTERNS = [
    // import / export ... from 'pkg' (including export * from 'pkg')
    /^\s*(?:import|export)\s+(?:type\s+)?(?:\*\s*(?:as\s+\w+)?|\{[^}]*\}|[\w\s,]+)?\s*from\s*['"]([^'"]+)['"]/gm,
    // side-effect import: import 'pkg'
    /^\s*import\s*['"]([^'"]+)['"]/gm,
    // export { ... } from 'pkg'
    /^\s*export\s*\{[^}]*\}\s*from\s*['"]([^'"]+)['"]/gm,
    // require('pkg')
    /(?:const|let|var)\s+(?:[\w\s{},:*]+)\s*=\s*require\(\s*['"]([^'"]+)['"]\s*\)/g,
    // dynamic import: import('pkg')
    /\bimport\(\s*['"]([^'"]+)['"]\s*\)/g
  ];

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
    let line = lines[lineIndex];

    // Strip single line comments
    const commentIdx = line.indexOf('//');
    if (commentIdx !== -1) {
      line = line.slice(0, commentIdx);
    }

    const trimmed = line.trim();
    if (!trimmed) continue;

    for (const regex of PATTERNS) {
      regex.lastIndex = 0;
      let match;
      while ((match = regex.exec(line)) !== null) {
        const rawSpecifier = match[1];
        const pkg = cleanPackageName(rawSpecifier);
        if (pkg && !packages.has(pkg)) {
          packages.set(pkg, {
            name: pkg,
            ecosystem: 'npm',
            file: filePath,
            line: lineIndex + 1,
            raw: rawSpecifier
          });
        }
      }
    }
  }

  return Array.from(packages.values());
}
