const PY_FROM_IMPORT = /^\s*from\s+([a-zA-Z0-9_\.]+)\s+import/gm;
const PY_IMPORT = /^\s*import\s+([a-zA-Z0-9_\., ]+)/gm;

export function extractPythonImports(sourceCode, filePath = '') {
  const packages = new Map();
  const lines = sourceCode.split('\n');

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
    const line = lines[lineIndex];
    const trimmed = line.trim();
    if (trimmed.startsWith('#')) continue;

    // from foo.bar import baz
    let fromMatch;
    PY_FROM_IMPORT.lastIndex = 0;
    if ((fromMatch = PY_FROM_IMPORT.exec(line)) !== null) {
      const modulePath = fromMatch[1];
      if (!modulePath.startsWith('.')) {
        const rootPkg = modulePath.split('.')[0].toLowerCase();
        if (rootPkg && !packages.has(rootPkg)) {
          packages.set(rootPkg, {
            name: rootPkg,
            ecosystem: 'pypi',
            file: filePath,
            line: lineIndex + 1,
            raw: modulePath
          });
        }
      }
    }

    // import foo, bar.baz as b
    let impMatch;
    PY_IMPORT.lastIndex = 0;
    if ((impMatch = PY_IMPORT.exec(line)) !== null) {
      const rawList = impMatch[1].split(',');
      for (const item of rawList) {
        const cleanItem = item.trim().split(/\s+as\s+/)[0].trim();
        if (cleanItem && !cleanItem.startsWith('.')) {
          const rootPkg = cleanItem.split('.')[0].toLowerCase();
          if (rootPkg && !packages.has(rootPkg)) {
            packages.set(rootPkg, {
              name: rootPkg,
              ecosystem: 'pypi',
              file: filePath,
              line: lineIndex + 1,
              raw: cleanItem
            });
          }
        }
      }
    }
  }

  return Array.from(packages.values());
}
