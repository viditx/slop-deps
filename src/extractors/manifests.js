export function extractPackageJson(content, filePath = 'package.json') {
  const packages = [];
  try {
    const pkg = JSON.parse(content);
    const sections = ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies'];
    for (const section of sections) {
      if (pkg[section] && typeof pkg[section] === 'object') {
        for (const name of Object.keys(pkg[section])) {
          packages.push({
            name,
            version: pkg[section][name],
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
    const line = lines[i].trim();
    if (!line || line.startsWith('#') || line.startsWith('-r') || line.startsWith('-e')) {
      continue;
    }
    // Match package name before any operator (==, >=, <=, ~=, !=, <, >, ;)
    const match = line.match(/^([a-zA-Z0-9_\-\.]+)/);
    if (match) {
      const name = match[1].toLowerCase();
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
