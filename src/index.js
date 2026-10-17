import { promises as fs } from 'fs';
import path from 'path';
import { extractJsImports } from './extractors/js-ts.js';
import { extractPythonImports } from './extractors/python.js';
import { extractPackageJson, extractRequirementsTxt } from './extractors/manifests.js';
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

async function getFilesRecursively(dir, fileList = []) {
  const entries = await fs.readdir(dir, { withFileTypes: true });

  for (const entry of entries) {
    if (IGNORED_DIRS.has(entry.name)) continue;
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      await getFilesRecursively(fullPath, fileList);
    } else if (entry.isFile()) {
      fileList.push(fullPath);
    }
  }

  return fileList;
}

export async function scanDirectory(targetDir = process.cwd(), options = {}) {
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

  const allFiles = await getFilesRecursively(targetDir);
  const packageReferences = [];

  for (const file of allFiles) {
    const ext = path.extname(file).toLowerCase();
    const basename = path.basename(file).toLowerCase();

    // Manifests
    if (basename === 'package.json') {
      try {
        const content = await fs.readFile(file, 'utf-8');
        const rel = path.relative(targetDir, file);
        const extracted = extractPackageJson(content, rel);
        extracted.forEach(p => p.isManifest = true);
        packageReferences.push(...extracted);
      } catch {}
      continue;
    }

    if (basename === 'requirements.txt') {
      try {
        const content = await fs.readFile(file, 'utf-8');
        const rel = path.relative(targetDir, file);
        const extracted = extractRequirementsTxt(content, rel);
        extracted.forEach(p => p.isManifest = true);
        packageReferences.push(...extracted);
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

    if (ext === '.py') {
      try {
        const content = await fs.readFile(file, 'utf-8');
        const rel = path.relative(targetDir, file);
        packageReferences.push(...extractPythonImports(content, rel));
      } catch {}
      continue;
    }
  }

  // Filter builtins and group by package key (ecosystem:name)
  const uniqueTargets = new Map();
  for (const ref of packageReferences) {
    if (isBuiltin(ref.name, ref.ecosystem)) continue;
    const key = `${ref.ecosystem}:${ref.name.toLowerCase()}`;
    if (!uniqueTargets.has(key)) {
      uniqueTargets.set(key, ref);
    } else {
      // If any reference is from a manifest, prioritize isManifest flag
      if (ref.isManifest) {
        uniqueTargets.get(key).isManifest = true;
      }
    }
  }

  const targets = Array.from(uniqueTargets.values());

  // Concurrently verify with a worker pool of 8 to avoid HTTP 429 rate limiting
  const findings = await mapConcurrent(targets, 8, async (target) => {
    let check;
    if (target.ecosystem === 'npm') {
      check = await checkNpmPackage(target.name);
    } else {
      check = await checkPyPiPackage(target.name, Boolean(target.isManifest));
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
