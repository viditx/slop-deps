export function extractPackageJson(content, filePath = 'package.json') {
  const packages = [];
  try {
    const pkg = JSON.parse(content);
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
              v.startsWith('github:') ||
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
          packages.push({
            name,
            version: String(version),
            ecosystem: 'npm',
            file: filePath,
            section
          });
        }
      }
    }
  } catch {
    // Malformed JSON, skip gracefully
  }
  return packages;
}

export function extractRequirementsTxt(content, filePath = 'requirements.txt') {
  const packages = [];
  const lines = content.split('\n');
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

    // Handle PEP 508 direct URL references: "package @ https://..."
    if (line.includes('@')) {
      const parts = line.split('@');
      const pkgName = parts[0].trim();
      if (/https?:\/\/|git\+/i.test(parts[1])) continue;
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
  const lines = content.split('\n');
  let currentSection = '';
  let inDependenciesArray = false;

  function parseTomlArrayItems(text, lineNum) {
    const itemMatches = text.matchAll(/["']([^"']+)["']/g);
    for (const m of itemMatches) {
      const spec = m[1].trim();
      if (!spec || spec.startsWith('-') || spec.includes('://')) continue;
      const nameMatch = spec.match(/^([a-zA-Z0-9_\-\.]+)/);
      if (nameMatch) {
        const name = nameMatch[1].toLowerCase();
        if (name && /[a-zA-Z0-9]/.test(name)) {
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
      continue;
    }

    const isProjectSection = currentSection === 'project';
    const isOptionalDepsSection = currentSection.startsWith('project.optional-dependencies') ||
                                  currentSection.startsWith('dependency-groups');

    // PEP 621 dependencies array or group array start
    if (
      (isProjectSection && /^(?:dependencies|optional-dependencies)\s*=\s*\[/i.test(line)) ||
      (isOptionalDepsSection && /^[a-zA-Z0-9_\-\.]+\s*=\s*\[/i.test(line))
    ) {
      inDependenciesArray = true;
      if (line.endsWith(']')) {
        const inner = line.slice(line.indexOf('[') + 1, line.lastIndexOf(']'));
        parseTomlArrayItems(inner, i + 1);
        inDependenciesArray = false;
      }
      continue;
    }

    if (inDependenciesArray) {
      if (line.startsWith(']')) {
        inDependenciesArray = false;
        continue;
      }
      parseTomlArrayItems(line, i + 1);
      continue;
    }

    // Poetry key = value style
    const isPoetrySection = currentSection === 'tool.poetry.dependencies' ||
                            currentSection === 'tool.poetry.dev-dependencies' ||
                            /^tool\.poetry\.group\.[^.]+\.dependencies$/.test(currentSection);

    if (isPoetrySection) {
      const match = line.match(/^([a-zA-Z0-9_\-\.]+)\s*=/);
      if (match) {
        const name = match[1].toLowerCase();
        if (name !== 'python') {
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
    const match = item.match(/^([a-zA-Z0-9_\-\.]+)/);
    if (match) {
      const name = match[1].toLowerCase();
      if (name && /[a-zA-Z0-9]/.test(name)) {
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
      const match = line.match(/^(?:["']([^"']+)["']|([a-zA-Z0-9_\-\.]+))\s*=/);
      if (match) {
        const name = (match[1] || match[2]).toLowerCase();
        if (name && /[a-zA-Z0-9]/.test(name) && name !== 'python') {
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

export function extractSetupPy(content, filePath = 'setup.py') {
  const packages = [];
  const listMatches = content.matchAll(/(?:install_requires|setup_requires|tests_require)\s*=\s*\[([\s\S]*?)\]/g);
  for (const m of listMatches) {
    const listBody = m[1];
    const itemMatches = listBody.matchAll(/["']([^"']+)["']/g);
    for (const item of itemMatches) {
      const spec = item[1].trim();
      if (!spec || spec.startsWith('-') || spec.includes('://')) continue;
      const nameMatch = spec.match(/^([a-zA-Z0-9_\-\.]+)/);
      if (nameMatch) {
        const name = nameMatch[1].toLowerCase();
        if (name && /[a-zA-Z0-9]/.test(name)) {
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
      const itemMatches = inner[1].matchAll(/["']([^"']+)["']/g);
      for (const item of itemMatches) {
        const spec = item[1].trim();
        if (!spec || spec.startsWith('-') || spec.includes('://')) continue;
        const nameMatch = spec.match(/^([a-zA-Z0-9_\-\.]+)/);
        if (nameMatch) {
          const name = nameMatch[1].toLowerCase();
          if (name && /[a-zA-Z0-9]/.test(name)) {
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

