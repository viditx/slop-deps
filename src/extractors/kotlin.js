// Kotlin / Gradle / Maven dependency extraction:
// - build.gradle.kts / build.gradle / settings.gradle.kts / settings.gradle
// - gradle/libs.versions.toml (Version Catalogs)
// - pom.xml (Maven POM)
// - .kt / .kts files (@file:DependsOn script dependencies)

// Gradle core standard plugins that are built into the Gradle distribution
const GRADLE_CORE_PLUGINS = new Set([
  'java', 'application', 'java-library', 'jvm-ecosystem', 'java-platform',
  'groovy', 'scala', 'war', 'ear', 'maven-publish', 'ivy-publish',
  'distribution', 'signing', 'checkstyle', 'pmd', 'jacoco', 'codenarc',
  'build-init', 'wrapper', 'base', 'help-tasks', 'lifecycle-base'
]);

const CONFIG_PREFIX = /^\s*(?:[a-zA-Z0-9_]+\.)?(implementation|api|compileOnly|runtimeOnly|testImplementation|testCompileOnly|testRuntimeOnly|androidTestImplementation|androidTestCompileOnly|kapt|ksp|annotationProcessor|classpath|debugImplementation|releaseImplementation|compile|runtime)\b/i;

const STRING_DEP_REGEX = /(?:platform|enforcedPlatform)?\s*\(?\s*['"]([a-zA-Z0-9_.-]+:[a-zA-Z0-9_.-]+(?::[a-zA-Z0-9_.-]+)?)['"]/g;
const NAMED_DEP_REGEX = /group\s*[:=]\s*['"]([a-zA-Z0-9_.-]+)['"]\s*,\s*name\s*[:=]\s*['"]([a-zA-Z0-9_.-]+)['"]/g;
const PLUGIN_REGEX = /id\s*(?:\(\s*|\s+)['"]([a-zA-Z0-9_.-]+)['"]/g;

export function extractGradleDependencies(source, filePath = 'build.gradle.kts') {
  const packages = new Map();
  const lines = source.split('\n');

  let inBlockComment = false;

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];

    if (inBlockComment) {
      const endIdx = line.indexOf('*/');
      if (endIdx !== -1) {
        inBlockComment = false;
        line = line.slice(endIdx + 2);
      } else {
        continue;
      }
    }

    const startIdx = line.indexOf('/*');
    if (startIdx !== -1) {
      const endIdx = line.indexOf('*/', startIdx + 2);
      if (endIdx !== -1) {
        line = line.slice(0, startIdx) + line.slice(endIdx + 2);
      } else {
        inBlockComment = true;
        line = line.slice(0, startIdx);
      }
    }

    const commentIdx = line.indexOf('//');
    if (commentIdx !== -1) {
      line = line.slice(0, commentIdx);
    }

    const trimmed = line.trim();
    if (!trimmed) continue;

    // 1. Plugins: id("com.example.plugin")
    PLUGIN_REGEX.lastIndex = 0;
    let pMatch;
    while ((pMatch = PLUGIN_REGEX.exec(line)) !== null) {
      const pluginId = pMatch[1].trim();
      if (!GRADLE_CORE_PLUGINS.has(pluginId.toLowerCase()) && pluginId.includes('.')) {
        const coord = `${pluginId}:${pluginId}.gradle.plugin`;
        if (!packages.has(coord)) {
          packages.set(coord, {
            name: coord,
            pluginId,
            isPlugin: true,
            ecosystem: 'maven',
            file: filePath,
            line: i + 1,
            raw: trimmed
          });
        }
      }
    }

    // 2. Dependencies
    if (CONFIG_PREFIX.test(trimmed)) {
      NAMED_DEP_REGEX.lastIndex = 0;
      let namedMatch;
      let matchedNamed = false;
      while ((namedMatch = NAMED_DEP_REGEX.exec(line)) !== null) {
        matchedNamed = true;
        const group = namedMatch[1].trim();
        const artifact = namedMatch[2].trim();
        const coord = `${group}:${artifact}`;
        if (!packages.has(coord)) {
          packages.set(coord, {
            name: coord,
            groupId: group,
            artifactId: artifact,
            ecosystem: 'maven',
            file: filePath,
            line: i + 1,
            raw: trimmed
          });
        }
      }

      if (!matchedNamed) {
        STRING_DEP_REGEX.lastIndex = 0;
        let strMatch;
        while ((strMatch = STRING_DEP_REGEX.exec(line)) !== null) {
          const rawCoord = strMatch[1].trim();
          const parts = rawCoord.split(':');
          if (parts.length >= 2) {
            const group = parts[0].trim();
            const artifact = parts[1].trim();
            const version = parts[2] ? parts[2].trim() : '';
            if (group === 'project' || group === 'file' || group === 'files') continue;

            const coord = `${group}:${artifact}`;
            if (!packages.has(coord)) {
              packages.set(coord, {
                name: coord,
                groupId: group,
                artifactId: artifact,
                version,
                ecosystem: 'maven',
                file: filePath,
                line: i + 1,
                raw: trimmed
              });
            }
          }
        }
      }
    }
  }

  return Array.from(packages.values());
}

export function extractLibsVersionsToml(source, filePath = 'gradle/libs.versions.toml') {
  const packages = new Map();
  const lines = source.split('\n');
  let currentSection = '';

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];
    const hashIdx = line.indexOf('#');
    if (hashIdx !== -1) line = line.slice(0, hashIdx);
    const trimmed = line.trim();
    if (!trimmed) continue;

    const sectionMatch = trimmed.match(/^\[([a-zA-Z0-9_.-]+)\]/);
    if (sectionMatch) {
      currentSection = sectionMatch[1].toLowerCase();
      continue;
    }

    if (currentSection === 'libraries') {
      const strMatch = trimmed.match(/^[a-zA-Z0-9_.-]+\s*=\s*['"]([a-zA-Z0-9_.-]+:[a-zA-Z0-9_.-]+(?::[a-zA-Z0-9_.-]+)?)['"]/);
      if (strMatch) {
        const parts = strMatch[1].split(':');
        const coord = `${parts[0]}:${parts[1]}`;
        if (!packages.has(coord)) {
          packages.set(coord, {
            name: coord,
            groupId: parts[0],
            artifactId: parts[1],
            version: parts[2] || '',
            raw: trimmed,
            ecosystem: 'maven',
            file: filePath,
            line: i + 1
          });
        }
        continue;
      }

      const moduleMatch = trimmed.match(/module\s*=\s*['"]([a-zA-Z0-9_.-]+:[a-zA-Z0-9_.-]+)['"]/);
      if (moduleMatch) {
        const parts = moduleMatch[1].split(':');
        const coord = `${parts[0]}:${parts[1]}`;
        if (!packages.has(coord)) {
          packages.set(coord, {
            name: coord,
            groupId: parts[0],
            artifactId: parts[1],
            raw: trimmed,
            ecosystem: 'maven',
            file: filePath,
            line: i + 1
          });
        }
        continue;
      }

      const groupMatch = trimmed.match(/group\s*=\s*['"]([a-zA-Z0-9_.-]+)['"]/);
      const nameMatch = trimmed.match(/name\s*=\s*['"]([a-zA-Z0-9_.-]+)['"]/);
      if (groupMatch && nameMatch) {
        const coord = `${groupMatch[1]}:${nameMatch[1]}`;
        if (!packages.has(coord)) {
          packages.set(coord, {
            name: coord,
            groupId: groupMatch[1],
            artifactId: nameMatch[1],
            raw: trimmed,
            ecosystem: 'maven',
            file: filePath,
            line: i + 1
          });
        }
        continue;
      }
    } else if (currentSection === 'plugins') {
      const idMatch = trimmed.match(/id\s*=\s*['"]([a-zA-Z0-9_.-]+)['"]/);
      if (idMatch && idMatch[1].includes('.')) {
        const pluginId = idMatch[1];
        const coord = `${pluginId}:${pluginId}.gradle.plugin`;
        if (!packages.has(coord)) {
          packages.set(coord, {
            name: coord,
            pluginId,
            isPlugin: true,
            ecosystem: 'maven',
            file: filePath,
            line: i + 1,
            raw: trimmed
          });
        }
        continue;
      }
      const strPlugin = trimmed.match(/^[a-zA-Z0-9_.-]+\s*=\s*['"]([a-zA-Z0-9_.-]+)(?::[a-zA-Z0-9_.-]+)?['"]/);
      if (strPlugin && strPlugin[1].includes('.')) {
        const pluginId = strPlugin[1];
        const coord = `${pluginId}:${pluginId}.gradle.plugin`;
        if (!packages.has(coord)) {
          packages.set(coord, {
            name: coord,
            pluginId,
            isPlugin: true,
            ecosystem: 'maven',
            file: filePath,
            line: i + 1,
            raw: trimmed
          });
        }
      }
    }
  }

  return Array.from(packages.values());
}

export function extractPomXml(source, filePath = 'pom.xml') {
  const packages = new Map();
  const depBlockRegex = /<dependency>([\s\S]*?)<\/dependency>/g;
  let match;

  while ((match = depBlockRegex.exec(source)) !== null) {
    const block = match[1];
    const groupMatch = block.match(/<groupId>\s*([a-zA-Z0-9_.-]+)\s*<\/groupId>/);
    const artifactMatch = block.match(/<artifactId>\s*([a-zA-Z0-9_.-]+)\s*<\/artifactId>/);
    const versionMatch = block.match(/<version>\s*([a-zA-Z0-9_.-]+)\s*<\/version>/);

    if (groupMatch && artifactMatch) {
      const group = groupMatch[1].trim();
      const artifact = artifactMatch[1].trim();
      if (group.startsWith('$') || artifact.startsWith('$')) continue;

      const coord = `${group}:${artifact}`;
      if (!packages.has(coord)) {
        const line = source.slice(0, match.index).split('\n').length;
        packages.set(coord, {
          name: coord,
          groupId: group,
          artifactId: artifact,
          version: versionMatch ? versionMatch[1].trim() : '',
          raw: match[0].replace(/\s+/g, ' ').trim(),
          ecosystem: 'maven',
          file: filePath,
          line
        });
      }
    }
  }

  return Array.from(packages.values());
}

export function extractKotlinScriptDependsOn(source, filePath = '') {
  const packages = new Map();
  const lines = source.split('\n');
  const DEPENDS_ON_REGEX = /@(?:file:)?DependsOn\s*\(\s*['"]([a-zA-Z0-9_.-]+:[a-zA-Z0-9_.-]+(?::[a-zA-Z0-9_.-]+)?)['"]\s*\)/g;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    let match;
    DEPENDS_ON_REGEX.lastIndex = 0;
    while ((match = DEPENDS_ON_REGEX.exec(line)) !== null) {
      const rawCoord = match[1].trim();
      const parts = rawCoord.split(':');
      if (parts.length >= 2) {
        const group = parts[0].trim();
        const artifact = parts[1].trim();
        const coord = `${group}:${artifact}`;
        if (!packages.has(coord)) {
          packages.set(coord, {
            name: coord,
            groupId: group,
            artifactId: artifact,
            version: parts[2] || '',
            raw: match[0].trim(),
            ecosystem: 'maven',
            file: filePath,
            line: i + 1
          });
        }
      }
    }
  }

  return Array.from(packages.values());
}
