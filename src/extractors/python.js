const PY_FROM_IMPORT = /^\s*from\s+([a-zA-Z0-9_\.]+)\s+import/gm;
const PY_IMPORT = /^\s*import\s+([a-zA-Z0-9_\., ]+)/gm;
const PY_DYNAMIC_IMPORT = /\b(?:importlib\.import_module|__import__)\s*\(\s*['"]([^'"]+)['"]/g;

function stripDocstrings(code) {
  // Strip triple-quoted docstrings/multiline strings while preserving newlines
  return code.replace(/(?:[rRfFbBuU]{1,2})?(?:"""[\s\S]*?"""|'''[\s\S]*?''')/g, (match) => {
    return '\n'.repeat((match.match(/\n/g) || []).length);
  });
}

export function extractPythonImports(sourceCode, filePath = '') {
  const packages = new Map();
  const cleanCode = stripDocstrings(sourceCode);
  const rawLines = cleanCode.split('\n');

  // Strip inline comments outside string literals and merge backslash line continuations
  const processedLines = [];
  let pendingText = '';
  let startLineNum = 1;

  for (let i = 0; i < rawLines.length; i++) {
    let line = rawLines[i];
    let inQuote = null;
    let commentIdx = -1;

    for (let c = 0; c < line.length; c++) {
      const ch = line[c];
      if (inQuote) {
        if (ch === '\\') { c++; continue; }
        if (ch === inQuote) inQuote = null;
      } else if (ch === '"' || ch === "'") {
        inQuote = ch;
      } else if (ch === '#') {
        commentIdx = c;
        break;
      }
    }

    if (commentIdx !== -1) {
      line = line.slice(0, commentIdx);
    }

    const trimmedEnd = line.trimEnd();
    if (trimmedEnd.endsWith('\\')) {
      if (!pendingText) startLineNum = i + 1;
      pendingText += trimmedEnd.slice(0, -1) + ' ';
    } else {
      if (pendingText) {
        processedLines.push({ text: pendingText + trimmedEnd, lineNum: startLineNum });
        pendingText = '';
      } else {
        processedLines.push({ text: trimmedEnd, lineNum: i + 1 });
      }
    }
  }

  for (const { text: line, lineNum } of processedLines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

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
            line: lineNum,
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
              line: lineNum,
              raw: cleanItem
            });
          }
        }
      }
    }

    // dynamic imports: importlib.import_module('foo') or __import__('foo')
    let dynMatch;
    PY_DYNAMIC_IMPORT.lastIndex = 0;
    while ((dynMatch = PY_DYNAMIC_IMPORT.exec(line)) !== null) {
      const rawModule = dynMatch[1].trim();
      if (rawModule && !rawModule.startsWith('.')) {
        const rootPkg = rawModule.split('.')[0].toLowerCase();
        if (rootPkg && !packages.has(rootPkg)) {
          packages.set(rootPkg, {
            name: rootPkg,
            ecosystem: 'pypi',
            file: filePath,
            line: lineNum,
            raw: rawModule
          });
        }
      }
    }
  }

  return Array.from(packages.values());
}
