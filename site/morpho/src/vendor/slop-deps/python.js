const PY_FROM_IMPORT = /^\s*from\s+([a-zA-Z0-9_\.]+)\s+import\s+([a-zA-Z0-9_,\s\(\)\*]+)/;
const PY_IMPORT = /^\s*import\s+([a-zA-Z0-9_\., ]+)/;
const PY_DYNAMIC_IMPORT = /\b(?:importlib\.import_module|__import__)\s*\(\s*['"]([^'"]+)['"]/g;

function stripDocstrings(code) {
  // Strip triple-quoted docstrings/multiline strings while preserving newlines
  return code.replace(/(?:[rRfFbBuU]{1,2})?(?:"""[\s\S]*?"""|'''[\s\S]*?''')/g, (match) => {
    return '\n'.repeat((match.match(/\n/g) || []).length);
  });
}

function getPythonRootModule(modulePath) {
  const parts = modulePath.split('.');
  const p0 = parts[0].toLowerCase();

  // Handle known PEP 420 namespace packages
  if (p0 === 'google') {
    if (parts.length >= 3 && (parts[1].toLowerCase() === 'cloud' || parts[1].toLowerCase() === 'ai')) {
      return `google.${parts[1].toLowerCase()}.${parts[2].toLowerCase()}`;
    }
    if (parts.length >= 2) {
      return `google.${parts[1].toLowerCase()}`;
    }
    return 'google';
  }

  if (p0 === 'azure') {
    if (parts.length >= 3 && (parts[1].toLowerCase() === 'storage' || parts[1].toLowerCase() === 'mgmt')) {
      return `azure.${parts[1].toLowerCase()}.${parts[2].toLowerCase()}`;
    }
    if (parts.length >= 2) {
      return `azure.${parts[1].toLowerCase()}`;
    }
    return 'azure';
  }

  if (p0 === 'opentelemetry') {
    if (parts.length >= 3 && parts[1].toLowerCase() === 'instrumentation') {
      return `opentelemetry.instrumentation.${parts[2].toLowerCase()}`;
    }
    if (parts.length >= 2) {
      return `opentelemetry.${parts[1].toLowerCase()}`;
    }
    return 'opentelemetry';
  }

  if (p0 === 'paho') {
    if (parts.length >= 2) {
      return `paho.${parts[1].toLowerCase()}`;
    }
    return 'paho';
  }

  return p0;
}

export function extractPythonImports(sourceCode, filePath = '') {
  const packages = new Map();
  const cleanCode = stripDocstrings(sourceCode);
  const rawLines = cleanCode.split('\n');

  // Strip inline comments outside string literals and merge backslash & parenthesis continuations
  const processedLines = [];
  let pendingText = '';
  let startLineNum = 1;
  let parenDepth = 0;

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
      } else if (ch === '(') {
        parenDepth++;
      } else if (ch === ')' && parenDepth > 0) {
        parenDepth--;
      }
    }

    if (commentIdx !== -1) {
      line = line.slice(0, commentIdx);
    }

    const trimmedEnd = line.trimEnd();
    const hasBackslash = trimmedEnd.endsWith('\\');
    const cleanChunk = hasBackslash ? trimmedEnd.slice(0, -1) : trimmedEnd;

    if (hasBackslash || parenDepth > 0) {
      if (!pendingText) startLineNum = i + 1;
      pendingText += cleanChunk + ' ';
    } else {
      if (pendingText) {
        processedLines.push({ text: (pendingText + cleanChunk).trim(), lineNum: startLineNum });
        pendingText = '';
      } else {
        processedLines.push({ text: cleanChunk.trim(), lineNum: i + 1 });
      }
    }
  }

function splitPythonStatements(line) {
  const stmts = [];
  let current = '';
  let inQuote = null;
  let bracketDepth = 0;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuote) {
      if (ch === '\\') {
        current += ch + (line[i + 1] ?? '');
        i++;
        continue;
      }
      if (ch === inQuote) inQuote = null;
      current += ch;
      continue;
    }

    if (ch === '"' || ch === "'") {
      inQuote = ch;
      current += ch;
      continue;
    }

    if (ch === '(' || ch === '[' || ch === '{') {
      bracketDepth++;
      current += ch;
      continue;
    }

    if ((ch === ')' || ch === ']' || ch === '}') && bracketDepth > 0) {
      bracketDepth--;
      current += ch;
      continue;
    }

    if (bracketDepth === 0) {
      if (ch === ';') {
        if (current.trim()) stmts.push(current.trim());
        current = '';
        continue;
      }
      if (ch === ':') {
        const trimmed = current.trim();
        if (/^(?:try|except|else|finally|if|elif|while|for|(?:async\s+)?(?:with|for)|def)\b/.test(trimmed)) {
          if (trimmed) stmts.push(trimmed);
          current = '';
          continue;
        }
      }
    }

    current += ch;
  }

  if (current.trim()) {
    stmts.push(current.trim());
  }

  return stmts;
}

  for (const { text: line, lineNum } of processedLines) {
    const statements = splitPythonStatements(line);
    for (const stmt of statements) {
      const trimmed = stmt.trim();
      if (!trimmed) continue;

      // from foo.bar import baz, qux
      let fromMatch = PY_FROM_IMPORT.exec(stmt);
      if (fromMatch) {
        const modulePath = fromMatch[1];
        const itemsRaw = fromMatch[2];
        if (!modulePath.startsWith('.')) {
          const parts = modulePath.split('.');
          const p0 = parts[0].toLowerCase();
          let targetPkgs = [];

          if (p0 === 'google' && parts.length === 2 && (parts[1].toLowerCase() === 'cloud' || parts[1].toLowerCase() === 'ai')) {
            const items = itemsRaw.replace(/[\(\)]/g, '').split(',').map(s => s.trim().split(/\s+as\s+/)[0].trim()).filter(Boolean);
            targetPkgs = items.map(it => `google.${parts[1].toLowerCase()}.${it.toLowerCase()}`);
          } else if (p0 === 'azure' && parts.length === 2 && (parts[1].toLowerCase() === 'storage' || parts[1].toLowerCase() === 'mgmt')) {
            const items = itemsRaw.replace(/[\(\)]/g, '').split(',').map(s => s.trim().split(/\s+as\s+/)[0].trim()).filter(Boolean);
            targetPkgs = items.map(it => `azure.${parts[1].toLowerCase()}.${it.toLowerCase()}`);
          } else if (p0 === 'opentelemetry' && parts.length === 2 && parts[1].toLowerCase() === 'instrumentation') {
            const items = itemsRaw.replace(/[\(\)]/g, '').split(',').map(s => s.trim().split(/\s+as\s+/)[0].trim()).filter(Boolean);
            targetPkgs = items.map(it => `opentelemetry.instrumentation.${it.toLowerCase()}`);
          } else if (p0 === 'paho' && parts.length === 1) {
            const items = itemsRaw.replace(/[\(\)]/g, '').split(',').map(s => s.trim().split(/\s+as\s+/)[0].trim()).filter(Boolean);
            targetPkgs = items.map(it => `paho.${it.toLowerCase()}`);
          } else {
            targetPkgs = [getPythonRootModule(modulePath)];
          }

          for (const rootPkg of targetPkgs) {
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
      }

      // import foo, bar.baz as b
      let impMatch;
      PY_IMPORT.lastIndex = 0;
      if ((impMatch = PY_IMPORT.exec(stmt)) !== null) {
        const rawList = impMatch[1].split(',');
        for (const item of rawList) {
          const cleanItem = item.trim().split(/\s+as\s+/)[0].trim();
          if (cleanItem && !cleanItem.startsWith('.')) {
            const rootPkg = getPythonRootModule(cleanItem);
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
      while ((dynMatch = PY_DYNAMIC_IMPORT.exec(stmt)) !== null) {
        const rawModule = dynMatch[1].trim();
        if (rawModule && !rawModule.startsWith('.')) {
          const rootPkg = getPythonRootModule(rawModule);
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
  }

  return Array.from(packages.values());
}
