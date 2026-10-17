import { promises as fs } from 'fs';
import path from 'path';
import { extractJsImports } from './extractors/js-ts.js';
import { extractPythonImports } from './extractors/python.js';
import { extractPackageJson, extractRequirementsTxt, extractPyProjectToml } from './extractors/manifests.js';
import { isBuiltin } from './builtins.js';
import { checkNpmPackage } from './registries/npm.js';
import { checkPyPiPackage } from './registries/pypi.js';

const IGNORED_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', '.next', '.nuxt',
  'out', 'coverage', '.cache', 'venv', '.venv', '__pycache__',
  '.idea', '.vscode'
]);

// Lightweight concurrent pool (zero external dependencies)
async function mapConcurrent(items, limit, fn) {
  const results = new Array(items.length);
  let index = 0;

  async function worker() {
    while (index < items.length) {
      const i = index++;
      results[i] = await fn(items[i], i);
    }
  }

  const workers = Array.from({ length: Math.min(limit, items.length) }, () => worker());
  await Promise.all(workers);
  return results;
}

async function getFilesRecursively(dir, fileList = [], dirNames = null, rootDir = dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });

  for (const entry of entries) {
    if (IGNORED_DIRS.has(entry.name)) continue;
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      if (dirNames) {
        dirNames.add(entry.name.toLowerCase());
        const rel = path.relative(rootDir, fullPath).replace(/\\/g, '/').toLowerCase();
        dirNames.add(rel);
      }
      await getFilesRecursively(fullPath, fileList, dirNames, rootDir);
    } else if (entry.isFile()) {
      fileList.push(fullPath);
    }
  }

  return fileList;
}

async function loadPathAliases(targetDir) {
  const aliases = new Set();
  const configs = ['tsconfig.json', 'jsconfig.json', 'tsconfig.base.json', 'tsconfig.app.json'];

  for (const cfg of configs) {
    try {
      const fullPath = path.join(targetDir, cfg);
      const raw = await fs.readFile(fullPath, 'utf-8');
      const cleanJson = raw.replace(/\/\*[\s\S]*?\*\/|([^:]|^)\/\/.*$/gm, '$1');
      const parsed = JSON.parse(cleanJson);
      const paths = parsed.compilerOptions?.paths;
      if (paths && typeof paths === 'object') {
        for (const aliasKey of Object.keys(paths)) {
          const cleanKey = aliasKey.replace(/\*$/, '').replace(/\/$/, '').trim();
          if (cleanKey) aliases.add(cleanKey.toLowerCase());
        }
      }
    } catch {}
  }
  return aliases;
}

export async function scanDirectory(targetDir = process.cwd()) {
  // Fail-closed: Ensure root directory actually exists!
  try {
    const stat = await fs.stat(targetDir);
    if (!stat.isDirectory()) {
      const err = new Error(`Target path is not a directory: ${targetDir}`);
      err.code = 'ENOTDIR';
      throw err;
    }
  } catch (err) {
    if (err.code === 'ENOENT') {
      const missingErr = new Error(`Target directory does not exist: ${targetDir}`);
      missingErr.code = 'ENOENT';
      throw missingErr;
    }
    throw err;
  }

  const dirNames = new Set();
  const allFiles = await getFilesRecursively(targetDir, [], dirNames, targetDir);
  const pathAliases = await loadPathAliases(targetDir);

  // Python resolves imports against the local tree first: a same-named
  // .py file or package directory means the import is local, not a PyPI dep.
  const localPyModules = new Set();
  for (const file of allFiles) {
    if (file.toLowerCase().endsWith('.py') || file.toLowerCase().endsWith('.pyi')) {
      localPyModules.add(path.basename(file).replace(/\.pyi?$/i, '').toLowerCase());
    }
  }

  const packageReferences = [];

  for (const file of allFiles) {
    const ext = path.extname(file).toLowerCase();
    const basename = path.basename(file).toLowerCase();

    // Manifests
    if (basename === 'package.json') {
      try {
        const content = await fs.readFile(file, 'utf-8');
        const rel = path.relative(targetDir, file);
        packageReferences.push(...extractPackageJson(content, rel));
      } catch {}
      continue;
    }

    if (basename.endsWith('.txt') && (basename.includes('requirements') || basename.includes('reqs'))) {
      try {
        const content = await fs.readFile(file, 'utf-8');
        const rel = path.relative(targetDir, file);
        packageReferences.push(...extractRequirementsTxt(content, rel));
      } catch {}
      continue;
    }

    if (basename === 'pyproject.toml') {
      try {
        const content = await fs.readFile(file, 'utf-8');
        const rel = path.relative(targetDir, file);
        packageReferences.push(...extractPyProjectToml(content, rel));
      } catch {}
      continue;
    }

    // Source files
    if (['.js', '.mjs', '.cjs', '.ts', '.tsx', '.jsx'].includes(ext)) {
      try {
        const content = await fs.readFile(file, 'utf-8');
        const rel = path.relative(targetDir, file);
        packageReferences.push(...extractJsImports(content, rel));
      } catch {}
      continue;
    }

    if (ext === '.py' || ext === '.pyi') {
      try {
        const content = await fs.readFile(file, 'utf-8');
        const rel = path.relative(targetDir, file);
        packageReferences.push(...extractPythonImports(content, rel));
      } catch {}
      continue;
    }
  }

  // Filter builtins/local modules and group by package key (ecosystem:name)
  const uniqueTargets = new Map();
  for (const ref of packageReferences) {
    if (isBuiltin(ref.name, ref.ecosystem)) continue;

    // Python local tree check
    if (ref.ecosystem === 'pypi') {
      const lower = ref.name.toLowerCase();
      if (localPyModules.has(lower) || dirNames.has(lower)) continue;
    }

    // JS/TS local path alias & local folder checks
    if (ref.ecosystem === 'npm') {
      const lowerName = ref.name.toLowerCase();
      let isAlias = false;
      for (const alias of pathAliases) {
        if (lowerName === alias || lowerName.startsWith(alias + '/')) {
          isAlias = true;
          break;
        }
      }
      if (isAlias) continue;

      // Handle @folder alias convention when folder exists locally on disk
      if (ref.name.startsWith('@')) {
        const scopeFolder = ref.name.slice(1).split('/')[0].toLowerCase();
        if (dirNames.has(scopeFolder) || dirNames.has(`src/${scopeFolder}`)) {
          continue;
        }
      }
    }

    const key = `${ref.ecosystem}:${ref.name.toLowerCase()}`;
    if (!uniqueTargets.has(key)) {
      uniqueTargets.set(key, ref);
    }
  }

  const targets = Array.from(uniqueTargets.values());

  // Concurrently verify with a worker pool of 8 to avoid HTTP 429 rate limiting
  const findings = await mapConcurrent(targets, 8, async (target) => {
    let check;
    if (target.ecosystem === 'npm') {
      check = await checkNpmPackage(target.name);
    } else {
      check = await checkPyPiPackage(target.name);
    }
    return {
      ...target,
      ...check
    };
  });

  return {
    findings,
    stats: {
      total: findings.length,
      critical: findings.filter(f => f.risk === 'CRITICAL').length,
      suspicious: findings.filter(f => f.risk === 'HIGH').length,
      warn: findings.filter(f => f.risk === 'WARN').length,
      clean: findings.filter(f => f.risk === 'CLEAN').length
    }
  };
}
