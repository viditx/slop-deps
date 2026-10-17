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

async function getFilesRecursively(dir, fileList = []) {
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return fileList;
  }

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
        packageReferences.push(...extractPackageJson(content, rel));
      } catch {}
      continue;
    }

    if (basename === 'requirements.txt') {
      try {
        const content = await fs.readFile(file, 'utf-8');
        const rel = path.relative(targetDir, file);
        packageReferences.push(...extractRequirementsTxt(content, rel));
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
    }
  }

  // Concurrently verify against registries
  const targets = Array.from(uniqueTargets.values());
  const findings = await Promise.all(
    targets.map(async (target) => {
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
    })
  );

  return {
    findings,
    stats: {
      total: findings.length,
      critical: findings.filter(f => f.risk === 'CRITICAL').length,
      suspicious: findings.filter(f => f.risk === 'HIGH').length,
      clean: findings.filter(f => f.risk === 'CLEAN').length
    }
  };
}
