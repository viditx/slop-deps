import path from 'path';

export function extractPackageJson(content, filePath = 'package.json') {
  const packages = [];
  const cleanContent = (content || '').replace(/^\uFEFF/, '');
  try {
    const pkg = JSON.parse(cleanContent);
    const sections = ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies'];
    for (const section of sections) {
      if (pkg[section] && typeof pkg[section] === 'object') {
        for (const [name, version] of Object.entries(pkg[section])) {
          if (typeof version === 'string') {
            const v = version.trim();
            // Skip non-registry dependencies: local paths, workspaces, direct git/urls
            if (
              v.startsWith('workspace:') ||
              v.startsWith('file:') ||
              v.startsWith('link:') ||
              v.startsWith('portal:') ||
              v.startsWith('git:') ||
              v.startsWith('git+') ||
              v.startsWith('git@') ||
              v.startsWith('github:') ||
              v.startsWith('patch:') ||
              v.startsWith('http:') ||
              v.startsWith('https:')
            ) {
              continue;
            }
            // Handle npm: aliases, e.g. "my-pkg": "npm:real-pkg@^1.0.0" or "btn": "npm:@scope/btn@^1.0.0"
            if (v.startsWith('npm:')) {
              let trimmed = v.slice(4).trim();
              let targetPkg = null;
              if (trimmed.startsWith('@')) {
                const parts = trimmed.split('/');
                if (parts.length >= 2) {
                  const pkgPart = parts[1].split('@')[0];
                  targetPkg = `${parts[0]}/${pkgPart}`;
                }
              } else {
                targetPkg = trimmed.split('/')[0].split('@')[0];
              }
              if (targetPkg) {
                packages.push({
                  name: targetPkg,
                  version: v,
                  ecosystem: 'npm',
                  file: filePath,
                  section
                });
                continue;
              }
            }
          }
          let cleanName = name.trim();
          if (cleanName.startsWith('@')) {
            const parts = cleanName.split('/');
            cleanName = parts.slice(0, 2).join('/');
          } else {
            cleanName = cleanName.split('/')[0];
          }
          packages.push({
            name: cleanName,
            version: String(version),
            ecosystem: 'npm',
            file: filePath,
            section
          });
        }
      }
    }

    // bundledDependencies / bundleDependencies are plain string arrays of names
    for (const bundleKey of ['bundledDependencies', 'bundleDependencies']) {
      const arr = pkg[bundleKey];
      if (Array.isArray(arr)) {
        for (const raw of arr) {
          if (typeof raw !== 'string') continue;
          const cleanName = raw.trim();
          if (!cleanName) continue;
          packages.push({
            name: cleanName,
            version: '',
            ecosystem: 'npm',
            file: filePath,
            section: bundleKey
          });
        }
      }
    }
  } catch (err) {
    let errLine = 1;
    if (err.message.includes('Unexpected end of JSON input')) {
      errLine = cleanContent.trimEnd().split('\n').length;
    } else {
      const posMatch = err.message.match(/at position (\d+)/i);
      const lineMatch = err.message.match(/line (\d+)/i);
      if (posMatch) {
        const pos = parseInt(posMatch[1], 10);
        errLine = cleanContent.slice(0, pos).split('\n').length;
      } else if (lineMatch) {
        errLine = parseInt(lineMatch[1], 10);
      } else {
        const snippetMatch = err.message.match(/\.\.\."([^"]+)"/);
        if (snippetMatch) {
          const rawSnippet = snippetMatch[1].replace(/\\n/g, '\n').replace(/\\"/g, '"');
          const idx = cleanContent.indexOf(rawSnippet.slice(0, 10));
          if (idx !== -1) {
            errLine = cleanContent.slice(0, idx).split('\n').length;
          }
        }
      }
    }
    return [{
      name: path.basename(filePath),
      ecosystem: 'npm',
      file: filePath,
      line: errLine,
      status: 'UNKNOWN',
      risk: 'WARN',
      exists: null,
      message: `Malformed JSON manifest in ${filePath}:${errLine}: ${err.message}`
    }];
  }
  return packages;
}

export function extractRequirementsTxt(content, filePath = 'requirements.txt') {
  const packages = [];
  const cleanContent = (content || '').replace(/^\uFEFF/, '');
  const lines = cleanContent.replace(/\r\n/g, '\n').split('\n');
  for (let i = 0; i < lines.length; i++) {
    let line = lines[i].trim();
    // Strip inline comments
    const commentIdx = line.indexOf('#');
    if (commentIdx !== -1) line = line.slice(0, commentIdx).trim();

    if (!line) continue;

    // Skip flags (-r, -f, -i, --extra-index-url, etc.)
    if (line.startsWith('-')) continue;

    // Skip direct URLs, VCS references, and local file paths
    if (
      line.startsWith('http://') ||
      line.startsWith('https://') ||
      line.startsWith('git+') ||
      line.startsWith('hg+') ||
      line.startsWith('svn+') ||
      line.startsWith('.') ||
      line.startsWith('/') ||
      line.includes('://')
    ) {
      continue;
    }

    // Handle PEP 508 direct URL references: "package @ https://..." or "package @ ./local"
    if (line.includes('@')) {
      const parts = line.split('@');
      const pkgName = parts[0].trim();
      // Anything scheme-like or path-like after @ is a direct/local reference, not a registry dep
      if (parts.length > 1 && /^\s*(?:[\w+.-]+:|[/~.])/.test(parts[1])) continue;
      line = pkgName;
    }

    // Match package name before any operator (==, >=, <=, ~=, !=, <, >, ;, [)
    const match = line.match(/^([a-zA-Z0-9_\-\.]+)/);
    if (match) {
      const name = match[1].toLowerCase();
      if (name === '.' || name === '..' || !/[a-zA-Z0-9]/.test(name)) continue;

      packages.push({
        name,
        raw: line,
        ecosystem: 'pypi',
        file: filePath,
        line: i + 1
      });
    }
  }
  return packages;
}

export function extractPyProjectToml(content, filePath = 'pyproject.toml') {
  const packages = [];
  const cleanContent = (content || '').replace(/^\uFEFF/, '');
  const lines = cleanContent.replace(/\r\n/g, '\n').split('\n');
  let currentSection = '';
  let inDependenciesArray = false;
  let depStartLine = 1;
  const seenKeys = new Map();

  function parseTomlArrayItems(text, lineNum) {
    const itemMatches = text.matchAll(/(?:"([^"\\]*(?:\\.[^"\\]*)*)"|'([^']*)')/g);
    for (const m of itemMatches) {
      const spec = (m[1] !== undefined ? m[1] : m[2]).trim();
      if (!spec || spec.startsWith('-') || spec.includes('://')) continue;

      // Strip PEP 508 environment markers (everything after semicolon)
      const semicolonIdx = spec.indexOf(';');
      const cleanSpec = semicolonIdx !== -1 ? spec.slice(0, semicolonIdx).trim() : spec;

      const nameMatch = cleanSpec.match(/^([a-zA-Z0-9_\-\.]+)/);
      if (nameMatch) {
        const name = nameMatch[1].toLowerCase();
        if (name && /[a-zA-Z0-9]/.test(name) && !['and', 'or', 'not', 'in'].includes(name)) {
          packages.push({
            name,
            raw: spec,
            ecosystem: 'pypi',
            file: filePath,
            line: lineNum
          });
        }
      }
    }
  }

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i].trim();
    const commentIdx = line.indexOf('#');
    if (commentIdx !== -1) line = line.slice(0, commentIdx).trim();
    if (!line) continue;

    // Check section header: [section] or [[array_of_tables]]
    const sectionMatch = line.match(/^\[+([^\]]+)\]+/);
    if (sectionMatch) {
      currentSection = sectionMatch[1].trim().toLowerCase();
      inDependenciesArray = false;
      if (!seenKeys.has(currentSection)) seenKeys.set(currentSection, new Set());
      continue;
    }

    const isProjectSection = currentSection === 'project';
    const isOptionalDepsSection = currentSection.startsWith('project.optional-dependencies') ||
                                  currentSection.startsWith('dependency-groups');
    const isBuildSystem = currentSection === 'build-system';
    const isFlitMetadata = currentSection === 'tool.flit.metadata';

    // PEP 621, PEP 518 [build-system], and Flit dependencies array
    if (
      (isProjectSection && /^(?:dependencies|optional-dependencies)\s*=\s*\[/i.test(line)) ||
      (isOptionalDepsSection && /^[a-zA-Z0-9_\-\.]+\s*=\s*\[/i.test(line)) ||
      ((isBuildSystem || isFlitMetadata) && /^requires\s*=\s*\[/i.test(line))
    ) {
      inDependenciesArray = true;
      depStartLine = i + 1;
      if (line.endsWith(']')) {
        const inner = line.slice(line.indexOf('[') + 1, line.lastIndexOf(']'));
        parseTomlArrayItems(inner, i + 1);
        inDependenciesArray = false;
      }
      continue;
    }

    if (inDependenciesArray) {
      parseTomlArrayItems(line, i + 1);
      // Quoted items always end with a quote, so a trailing ']' means the array closes here
      if (line.startsWith(']') || line.endsWith(']')) {
        inDependenciesArray = false;
      }
      continue;
    }

    // Poetry key = value style
    const isPoetrySection = currentSection === 'tool.poetry.dependencies' ||
                            currentSection === 'tool.poetry.dev-dependencies' ||
                            /^tool\.poetry\.group\.[^.]+\.dependencies$/.test(currentSection);

    if (isPoetrySection) {
      // Skip local path, git, or direct URL dependencies
      if (/(?:path|git|url)\s*=/i.test(line)) continue;

      const match = line.match(/^([a-zA-Z0-9_\-\.]+)\s*=/);
      if (match) {
        const key = match[1].toLowerCase();
        const sectionKeySet = seenKeys.get(currentSection) || new Set();
        if (sectionKeySet.has(key)) {
          packages.push({
            name: key,
            ecosystem: 'pypi',
            file: filePath,
            line: i + 1,
            status: 'UNKNOWN',
            risk: 'WARN',
            exists: null,
            message: `Malformed TOML: Duplicate key '${key}' in [${currentSection}] at line ${i + 1}`
          });
        }
        sectionKeySet.add(key);
        seenKeys.set(currentSection, sectionKeySet);

        if (key !== 'python') {
          packages.push({
            name: key,
            raw: line,
            ecosystem: 'pypi',
            file: filePath,
            line: i + 1
          });
        }
      }
    }
  }

  if (inDependenciesArray) {
    packages.push({
      name: path.basename(filePath),
      ecosystem: 'pypi',
      file: filePath,
      line: depStartLine,
      status: 'UNKNOWN',
      risk: 'WARN',
      exists: null,
      message: `Malformed TOML: Unclosed dependency array starting at line ${depStartLine} in ${filePath}`
    });
  }

  return packages;
}

export function extractSetupCfg(content, filePath = 'setup.cfg') {
  const packages = [];
  const lines = content.split('\n');
  let inRequiresSection = false;
  let currentSection = '';

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    let line = rawLine.trim();
    const commentIdx = line.indexOf('#');
    if (commentIdx !== -1) line = line.slice(0, commentIdx).trim();

    if (!line) {
      if (!rawLine.startsWith(' ') && !rawLine.startsWith('\t')) {
        inRequiresSection = false;
      }
      continue;
    }

    if (line.startsWith('[')) {
      currentSection = line.replace(/[\[\]]/g, '').trim().toLowerCase();
      inRequiresSection = false;
      continue;
    }

    if (
      (currentSection === 'options' && /^install_requires\s*=/i.test(line)) ||
      (currentSection === 'options.extras_require' && /^[a-zA-Z0-9_\-\.]+\s*=/i.test(line))
    ) {
      inRequiresSection = true;
      const afterEq = line.slice(line.indexOf('=') + 1).trim();
      if (afterEq) {
        parseReqItem(afterEq, i + 1);
      }
      continue;
    }

    if (inRequiresSection) {
      // Indented continuation line
      if (rawLine.startsWith(' ') || rawLine.startsWith('\t')) {
        parseReqItem(line, i + 1);
      } else {
        inRequiresSection = false;
      }
    }
  }

  function parseReqItem(item, lineNum) {
    if (!item || item.startsWith('-') || item.includes('://')) return;
    const semicolonIdx = item.indexOf(';');
    const cleanItem = semicolonIdx !== -1 ? item.slice(0, semicolonIdx).trim() : item;
    const match = cleanItem.match(/^([a-zA-Z0-9_\-\.]+)/);
    if (match) {
      const name = match[1].toLowerCase();
      if (name && /[a-zA-Z0-9]/.test(name) && !['and', 'or', 'not', 'in'].includes(name)) {
        packages.push({
          name,
          raw: item,
          ecosystem: 'pypi',
          file: filePath,
          line: lineNum
        });
      }
    }
  }

  return packages;
}

export function extractPipfile(content, filePath = 'Pipfile') {
  const packages = [];
  const lines = content.split('\n');
  let currentSection = '';

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i].trim();
    const commentIdx = line.indexOf('#');
    if (commentIdx !== -1) line = line.slice(0, commentIdx).trim();
    if (!line) continue;

    const sectionMatch = line.match(/^\[+([^\]]+)\]+/);
    if (sectionMatch) {
      currentSection = sectionMatch[1].trim().toLowerCase();
      continue;
    }

    if (currentSection === 'packages' || currentSection === 'dev-packages' || currentSection.endsWith('-packages')) {
      // Skip local path, git, or direct file dependencies
      if (/(?:path|git|file)\s*=/i.test(line)) continue;

      // Extras like requests[socks] are part of the key, not the name
      const match = line.match(/^(?:["']([^"'\[\]]+)["']|([a-zA-Z0-9_\-\.]+(?:\[[^\]=]+\])?))\s*=/);
      if (match) {
        const name = (match[1] || match[2]).toLowerCase().replace(/\[[^\]]*\]/g, '').trim();
        if (name && /[a-zA-Z0-9]/.test(name) && name !== 'python' && !['and', 'or', 'not', 'in'].includes(name)) {
          packages.push({
            name,
            raw: line,
            ecosystem: 'pypi',
            file: filePath,
            line: i + 1
          });
        }
      }
    }
  }

  return packages;
}

export function extractCargoToml(content, filePath = 'Cargo.toml') {
  const packages = [];
  const cleanContent = (content || '').replace(/^\uFEFF/, '');
  const lines = cleanContent.replace(/\r\n/g, '\n').split('\n');
  let inDeps = false;
  let currentSection = '';
  const seenKeys = new Map();

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i].trim();
    const commentIdx = line.indexOf('#');
    if (commentIdx !== -1) line = line.slice(0, commentIdx).trim();
    if (!line) continue;

    const sectionMatch = line.match(/^\[+([^\]]+)\]+/);
    if (sectionMatch) {
      currentSection = sectionMatch[1].trim();
      // [dependencies], [dev-dependencies], [build-dependencies], [workspace.dependencies],
      // [target.'cfg(...)'.dependencies], and inline sub-tables like [dependencies.serde_derive]
      const depsMatch = currentSection.match(/^(?:workspace\.)?(?:dev-|build-)?dependencies(?:\.([a-zA-Z0-9_-]+))?$/)
        || currentSection.match(/^target\.[^.]+(?:\.[^]]*)?\.(?:dev-|build-)?dependencies(?:\.([a-zA-Z0-9_-]+))?$/);
      inDeps = Boolean(depsMatch);
      if (!seenKeys.has(currentSection)) seenKeys.set(currentSection, new Set());
      if (inDeps && depsMatch[1]) {
        packages.push({ name: depsMatch[1].toLowerCase(), raw: currentSection, ecosystem: 'cargo', file: filePath, line: i + 1 });
      }
      continue;
    }

    if (!inDeps) continue;

    // path/git/registry-only deps never touch crates.io
    if (/(?:path|git|registry|workspace)\s*=\s*(?!"[0-9])/i.test(line) && !/version\s*=/.test(line)) continue;
    if (/^(?:path|git|registry)\s*=/i.test(line)) continue;

    const match = line.match(/^([a-zA-Z0-9_-]+)\s*=\s*/);
    if (match) {
      const name = match[1].toLowerCase();
      const sectionKeySet = seenKeys.get(currentSection) || new Set();
      if (sectionKeySet.has(name)) {
        packages.push({
          name,
          ecosystem: 'cargo',
          file: filePath,
          line: i + 1,
          status: 'UNKNOWN',
          risk: 'WARN',
          exists: null,
          message: `Malformed TOML: Duplicate key '${name}' in [${currentSection}] at line ${i + 1}`
        });
      }
      sectionKeySet.add(name);
      seenKeys.set(currentSection, sectionKeySet);

      if (name && name !== 'workspace') {
        packages.push({ name, raw: line, ecosystem: 'cargo', file: filePath, line: i + 1 });
      }
    }
  }

  return packages;
}

export function extractSetupPy(content, filePath = 'setup.py') {
  const packages = [];
  const listMatches = content.matchAll(/(?:install_requires|setup_requires|tests_require)\s*=\s*\[([\s\S]*?)\]/g);
  for (const m of listMatches) {
    const listBody = m[1];
    const itemMatches = listBody.matchAll(/(?:"([^"\\]*(?:\\.[^"\\]*)*)"|'([^']*)')/g);
    for (const item of itemMatches) {
      const spec = (item[1] !== undefined ? item[1] : item[2]).trim();
      if (!spec || spec.startsWith('-') || spec.includes('://')) continue;
      const semicolonIdx = spec.indexOf(';');
      const cleanSpec = semicolonIdx !== -1 ? spec.slice(0, semicolonIdx).trim() : spec;
      const nameMatch = cleanSpec.match(/^([a-zA-Z0-9_\-\.]+)/);
      if (nameMatch) {
        const name = nameMatch[1].toLowerCase();
        if (name && /[a-zA-Z0-9]/.test(name) && !['and', 'or', 'not', 'in'].includes(name)) {
          packages.push({
            name,
            raw: spec,
            ecosystem: 'pypi',
            file: filePath
          });
        }
      }
    }
  }

  const extrasMatch = content.match(/extras_require\s*=\s*\{([\s\S]*?)\}/);
  if (extrasMatch) {
    const dictBody = extrasMatch[1];
    const innerLists = dictBody.matchAll(/\[([\s\S]*?)\]/g);
    for (const inner of innerLists) {
      const itemMatches = inner[1].matchAll(/(?:"([^"\\]*(?:\\.[^"\\]*)*)"|'([^']*)')/g);
      for (const item of itemMatches) {
        const spec = (item[1] !== undefined ? item[1] : item[2]).trim();
        if (!spec || spec.startsWith('-') || spec.includes('://')) continue;
        const semicolonIdx = spec.indexOf(';');
        const cleanSpec = semicolonIdx !== -1 ? spec.slice(0, semicolonIdx).trim() : spec;
        const nameMatch = cleanSpec.match(/^([a-zA-Z0-9_\-\.]+)/);
        if (nameMatch) {
          const name = nameMatch[1].toLowerCase();
          if (name && /[a-zA-Z0-9]/.test(name) && !['and', 'or', 'not', 'in'].includes(name)) {
            packages.push({
              name,
              raw: spec,
              ecosystem: 'pypi',
              file: filePath
            });
          }
        }
      }
    }
  }

  return packages;
}

export function extractDenoJson(content, filePath = 'deno.json') {
  const packages = [];
  const cleanContent = (content || '').replace(/^\uFEFF/, '').replace(/\/\*[\s\S]*?\*\/|([^:]|^)\/\/.*$/gm, '$1');
  try {
    const config = JSON.parse(cleanContent);
    const extractFromMap = (mapObj) => {
      if (!mapObj || typeof mapObj !== 'object') return;
      for (const [alias, specifier] of Object.entries(mapObj)) {
        if (typeof specifier === 'string' && specifier.startsWith('npm:')) {
          let trimmed = specifier.slice(4).trim();
          let targetPkg = null;
          if (trimmed.startsWith('@')) {
            const parts = trimmed.split('/');
            if (parts.length >= 2) {
              const pkgPart = parts[1].split('@')[0];
              targetPkg = `${parts[0]}/${pkgPart}`;
            }
          } else {
            targetPkg = trimmed.split('/')[0].split('@')[0];
          }
          if (targetPkg) {
            packages.push({
              name: targetPkg,
              version: specifier,
              ecosystem: 'npm',
              file: filePath
            });
          }
        }
      }
    };

    extractFromMap(config.imports);
    if (config.scopes && typeof config.scopes === 'object') {
      for (const scopeMap of Object.values(config.scopes)) {
        extractFromMap(scopeMap);
      }
    }
  } catch {}

  return packages;
}

