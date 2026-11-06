// Pure ESM manifest extractors for package.json, requirements.txt, pyproject.toml, and Cargo.toml (zero Node builtin imports)

export function extractPackageJson(content) {
  if (!content || typeof content !== 'string') return [];
  let parsed;
  try {
    parsed = JSON.parse(content);
  } catch {
    return [];
  }
  if (!parsed || typeof parsed !== 'object') return [];

  const sections = [
    parsed.dependencies,
    parsed.devDependencies,
    parsed.peerDependencies,
    parsed.optionalDependencies,
  ];

  const seen = new Set();
  const results = [];

  for (const sec of sections) {
    if (!sec || typeof sec !== 'object') continue;
    for (const [rawName, rawVer] of Object.entries(sec)) {
      const name = String(rawName).trim();
      const version = String(rawVer ?? '').trim();
      if (!name || seen.has(name)) continue;
      // Skip local workspace/file/link/git protocol references
      if (
        version.startsWith('workspace:') ||
        version.startsWith('file:') ||
        version.startsWith('link:') ||
        version.startsWith('portal:') ||
        version.startsWith('git+') ||
        version.startsWith('github:')
      ) {
        continue;
      }
      seen.add(name);
      results.push({ name, version: version || 'latest', ecosystem: 'npm' });
    }
  }

  return results;
}

export function extractRequirementsTxt(content) {
  if (!content || typeof content !== 'string') return [];
  const lines = content.split(/\r?\n/);
  const seen = new Set();
  const results = [];

  for (const rawLine of lines) {
    // Strip inline comments
    const withoutComment = rawLine.replace(/(^|\s)#.*$/, '').trim();
    if (!withoutComment) continue;
    // Skip pip options/flags (-r, -e, --index-url, --extra-index-url, etc.)
    if (withoutComment.startsWith('-')) continue;
    // Strip environment markers (; python_version < '3.11')
    const withoutMarker = withoutComment.split(';')[0].trim();
    if (!withoutMarker) continue;

    // Match PEP 508 package name, optional extras [...], and optional version specifier
    const match = withoutMarker.match(
      /^([A-Za-z0-9][A-Za-z0-9._-]*)(?:\[[^\]]*\])?\s*(?:(===|==|~=|!=|<=|>=|<|>)\s*([^\s,]+))?/
    );
    if (!match) continue;

    const name = match[1].trim();
    const version = match[3] ? `${match[2] || ''}${match[3]}` : 'latest';
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    results.push({ name, version, ecosystem: 'pypi' });
  }

  return results;
}

export function extractPyProjectToml(content) {
  if (!content || typeof content !== 'string') return [];
  const lines = content.split(/\r?\n/);
  const seen = new Set();
  const results = [];

  let currentSection = '';
  let inDependenciesArray = false;

  const pushPypiDep = (name, version = 'latest') => {
    const clean = String(name).trim();
    if (!clean || clean.toLowerCase() === 'python') return;
    const key = clean.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    results.push({ name: clean, version, ecosystem: 'pypi' });
  };

  for (const rawLine of lines) {
    const line = rawLine.replace(/#.*$/, '').trim();
    if (!line) continue;

    const secMatch = line.match(/^\[([^\]]+)\]$/);
    if (secMatch) {
      currentSection = secMatch[1].trim();
      inDependenciesArray = false;
      continue;
    }

    // PEP 621: [project] dependencies = [ "fastapi>=0.115.0", ... ]
    if (
      currentSection === 'project' ||
      currentSection.startsWith('project.optional-dependencies')
    ) {
      if (line.match(/^[A-Za-z0-9_-]+\s*=\s*\[/)) {
        inDependenciesArray = true;
      }
      if (inDependenciesArray) {
        const strMatches = line.matchAll(/["']([^"']+)["']/g);
        for (const m of strMatches) {
          const parsed = extractRequirementsTxt(m[1]);
          for (const item of parsed) {
            pushPypiDep(item.name, item.version);
          }
        }
        if (line.includes(']')) {
          inDependenciesArray = false;
        }
      }
      continue;
    }

    // Poetry: [tool.poetry.dependencies] or [tool.poetry.group.*.dependencies]
    if (
      currentSection === 'tool.poetry.dependencies' ||
      currentSection === 'tool.poetry.dev-dependencies' ||
      /^tool\.poetry\.group\.[^.]+\.dependencies$/.test(currentSection)
    ) {
      const kv = line.match(/^([A-Za-z0-9_.-]+)\s*=\s*(.+)$/);
      if (kv) {
        const pkgName = kv[1].trim();
        const rhs = kv[2].trim();
        if (/path\s*=|git\s*=/.test(rhs)) continue;
        const verMatch =
          rhs.match(/^["']([^"']+)["']/) ||
          rhs.match(/version\s*=\s*["']([^"']+)["']/);
        pushPypiDep(pkgName, verMatch ? verMatch[1] : 'latest');
      }
    }
  }

  return results;
}

export function extractCargoToml(content) {
  if (!content || typeof content !== 'string') return [];
  const lines = content.split(/\r?\n/);
  const seen = new Set();
  const results = [];

  let currentSection = '';

  for (const rawLine of lines) {
    const line = rawLine.replace(/#.*$/, '').trim();
    if (!line) continue;

    const secMatch = line.match(/^\[([^\]]+)\]$/);
    if (secMatch) {
      currentSection = secMatch[1].trim();
      continue;
    }

    const isDepSection =
      currentSection === 'dependencies' ||
      currentSection === 'dev-dependencies' ||
      currentSection === 'build-dependencies' ||
      currentSection === 'workspace.dependencies' ||
      /\.dependencies$/.test(currentSection);

    if (!isDepSection) continue;

    const kv = line.match(/^([A-Za-z0-9_-]+)\s*=\s*(.+)$/);
    if (!kv) continue;

    let crateName = kv[1].trim();
    const rhs = kv[2].trim();

    // Skip local path or git dependencies
    if (/path\s*=|git\s*=/.test(rhs)) continue;

    // Handle renamed package: foo = { package = "actual-crate", version = "1.0" }
    const renamedMatch = rhs.match(/package\s*=\s*["']([^"']+)["']/);
    if (renamedMatch) {
      crateName = renamedMatch[1].trim();
    }

    const verMatch =
      rhs.match(/^["']([^"']+)["']/) ||
      rhs.match(/version\s*=\s*["']([^"']+)["']/);
    const version = verMatch ? verMatch[1] : 'latest';

    if (seen.has(crateName)) continue;
    seen.add(crateName);
    results.push({ name: crateName, version, ecosystem: 'crates' });
  }

  return results;
}
