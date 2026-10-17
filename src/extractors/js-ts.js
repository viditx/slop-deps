const IMPORT_REGEXES = [
  // import ... from 'package' / import 'package'
  /(?:import|export)\s+(?:(?:(?:\w+|\{[^}]*\}|\*\s+as\s+\w+)\s+from\s+)?|(?:type\s+(?:(?:\w+|\{[^}]*\}|\*\s+as\s+\w+)\s+from\s+)?))['"]([^'"]+)['"]/g,
  // require('package')
  /require\(\s*['"]([^'"]+)['"]\s*\)/g,
  // import('package')
  /import\(\s*['"]([^'"]+)['"]\s*\)/g
];

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
  const lines = sourceCode.split('\n');

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
    const line = lines[lineIndex];
    // Skip full comment lines
    const trimmed = line.trim();
    if (trimmed.startsWith('//') || trimmed.startsWith('/*') || trimmed.startsWith('*')) {
      continue;
    }

    for (const regex of IMPORT_REGEXES) {
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
