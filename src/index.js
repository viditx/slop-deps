import { promises as fs, existsSync } from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';
import { extractJsImports } from './extractors/js-ts.js';
import { extractPythonImports } from './extractors/python.js';
import { extractRustUses } from './extractors/rust.js';
import { extractPackageJson, extractRequirementsTxt, extractPyProjectToml, extractSetupCfg, extractPipfile, extractSetupPy, extractCargoToml } from './extractors/manifests.js';
import { isBuiltin, extendBuiltins } from './builtins.js';
import { checkNpmPackage } from './registries/npm.js';
import { checkPyPiPackage } from './registries/pypi.js';
import { checkRustPackage } from './registries/rust.js';
import { cacheGet, cacheFlush } from './registries/cache.js';
import { addPopularEntries, isPopularPackage } from './typosquat.js';
import { extendImportMap } from './pypi-map.js';

const IGNORED_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', '.next', '.nuxt',
  'out', 'coverage', '.cache', 'env', '.env', 'venv', '.venv',
  '.tox', '.nox', '.pytest_cache', '.mypy_cache', '.ruff_cache',
  '.svelte-kit', '.astro', '.output', '.turbo', '.parcel-cache',
  'site-packages', '__pycache__', '.idea', '.vscode',
  'appdata', 'application data', 'local settings', 'cookies',
  'nethood', 'printhood', 'recent', 'sendto', 'start menu',
  'templates', 'system volume information', '$recycle.bin',
  'program files', 'program files (x86)', 'programdata', 'windows'
]);

const SUPPORTED_EXTS = new Set(['.js', '.mjs', '.cjs', '.ts', '.tsx', '.jsx', '.py', '.pyi', '.rs']);
const SUPPORTED_MANIFESTS = new Set([
  'package.json', 'requirements.txt', 'pyproject.toml', 'setup.cfg',
  'pipfile', 'setup.py', 'cargo.toml', 'constraints.txt',
  'tsconfig.json', 'jsconfig.json'
]);

function isSupportedFile(filename) {
  const lower = filename.toLowerCase();
  if (SUPPORTED_MANIFESTS.has(lower) || (lower.startsWith('tsconfig.') && lower.endsWith('.json'))) return true;
  return SUPPORTED_EXTS.has(path.extname(lower));
}

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

async function getFilesRecursively(dir, fileList = [], dirNames = null, rootDir = dir, errors = []) {
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch (err) {
    errors.push({ path: dir, message: err.message });
    return fileList;
  }

  for (const entry of entries) {
    const lowerName = entry.name.toLowerCase();
    if (IGNORED_DIRS.has(lowerName)) continue;
    const fullPath = path.join(dir, entry.name);

    try {
      if (entry.isDirectory()) {
        if (entry.name.startsWith('.') && fullPath !== rootDir) continue;
        if (dirNames) {
          const rel = path.relative(rootDir, fullPath).replace(/\\/g, '/').toLowerCase();
          dirNames.add(rel);
          // Only direct top-level subdirectories of rootDir can be root packages
          if (path.dirname(fullPath) === rootDir) {
            dirNames.add(lowerName);
          }
        }
        await getFilesRecursively(fullPath, fileList, dirNames, rootDir, errors);
      } else if (entry.isFile()) {
        if (isSupportedFile(entry.name)) {
          fileList.push(fullPath);
        }
      }
    } catch (err) {
      errors.push({ path: fullPath, message: err.message });
      continue;
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

      const baseUrl = parsed.compilerOptions?.baseUrl;
      if (baseUrl && typeof baseUrl === 'string') {
        const baseDir = path.resolve(targetDir, baseUrl);
        try {
          const subEntries = await fs.readdir(baseDir, { withFileTypes: true });
          for (const sub of subEntries) {
            if (sub.isDirectory()) {
              aliases.add(sub.name.toLowerCase());
            } else if (sub.isFile() && /\.(?:js|mjs|cjs|ts|tsx|jsx)$/i.test(sub.name)) {
              aliases.add(sub.name.replace(/\.[^.]+$/, '').toLowerCase());
            }
          }
        } catch {}
      }
    } catch {}
  }
  return aliases;
}

async function loadRcConfig(targetDir) {
  try {
    const raw = await fs.readFile(path.join(targetDir, '.slopdepsrc.json'), 'utf-8');
    const rc = JSON.parse(raw);
    if (rc.builtins?.npm) extendBuiltins('npm', rc.builtins.npm);
    if (rc.builtins?.pypi) extendBuiltins('pypi', rc.builtins.pypi);
    if (rc.popular?.npm) addPopularEntries('npm', rc.popular.npm);
    if (rc.popular?.pypi) addPopularEntries('pypi', rc.popular.pypi);
    if (rc.map) extendImportMap(rc.map);
    return rc;
  } catch {
    return null;
  }
}

async function loadPrivateScopes(targetDir, rc) {
  const scopes = new Set();
  if (rc?.privateScopes && Array.isArray(rc.privateScopes)) {
    for (const s of rc.privateScopes) {
      const clean = String(s).trim().toLowerCase();
      if (clean) scopes.add(clean.startsWith('@') ? clean : `@${clean}`);
    }
  }
  if (rc?.ignoreScopes && Array.isArray(rc.ignoreScopes)) {
    for (const s of rc.ignoreScopes) {
      const clean = String(s).trim().toLowerCase();
      if (clean) scopes.add(clean.startsWith('@') ? clean : `@${clean}`);
    }
  }
  const envScopes = process.env.SLOP_DEPS_PRIVATE_SCOPES || process.env.SLOP_DEPS_IGNORE_SCOPES;
  if (envScopes) {
    for (const s of envScopes.split(',')) {
      const clean = s.trim().toLowerCase();
      if (clean) scopes.add(clean.startsWith('@') ? clean : `@${clean}`);
    }
  }
  const npmrcCandidates = [
    path.join(targetDir, '.npmrc'),
    path.join(process.cwd(), '.npmrc')
  ];
  for (const nPath of npmrcCandidates) {
    try {
      if (existsSync(nPath)) {
        const raw = await fs.readFile(nPath, 'utf-8');
        for (const line of raw.split(/\r?\n/)) {
          const trimmed = line.trim();
          if (trimmed.startsWith('#') || trimmed.startsWith(';')) continue;
          const m = trimmed.match(/^@([a-zA-Z0-9_.-]+):registry\s*=/i);
          if (m && m[1]) {
            scopes.add(`@${m[1].toLowerCase()}`);
          }
        }
      }
    } catch {}
  }
  return scopes;
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

  // staged mode: only content-read files present in this set (forward-slash absolute paths)
  const stagedFilter = options.stagedFiles || null;

  const rc = options.allowConfig !== false ? await loadRcConfig(targetDir) : null;
  const privateScopes = await loadPrivateScopes(targetDir, rc);

  const dirNames = new Set();
  const traversalErrors = [];
  const allFiles = await getFilesRecursively(targetDir, [], dirNames, targetDir, traversalErrors);
  const pathAliases = await loadPathAliases(targetDir);

  for (const file of allFiles) {
    const b = path.basename(file).toLowerCase();
    if (b === 'tsconfig.json' || b === 'jsconfig.json' || (b.startsWith('tsconfig.') && b.endsWith('.json'))) {
      const subAliases = await loadPathAliases(path.dirname(file));
      for (const a of subAliases) pathAliases.add(a);
    }
  }

  // Monorepo workspace packages and local Python modules
  const localWorkspacePackages = new Set();
  const localPyModules = new Set();

  for (const file of allFiles) {
    if (file.toLowerCase().endsWith('.py') || file.toLowerCase().endsWith('.pyi')) {
      localPyModules.add(path.basename(file).replace(/\.pyi?$/i, '').toLowerCase());
    }
  }

  const packageReferences = [];

  const safeReadFile = async (filePath) => {
    try {
      return await fs.readFile(filePath, 'utf-8');
    } catch (err) {
      traversalErrors.push({
        file: path.relative(targetDir, filePath),
        message: `Failed to read file: ${err.message}`
      });
      return null;
    }
  };

  for (const file of allFiles) {
    const ext = path.extname(file).toLowerCase();
    const basename = path.basename(file).toLowerCase();
    const isStaged = !stagedFilter || stagedFilter.has(file.replace(/\\/g, '/'));

    // Manifests
    if (basename === 'package.json') {
      const content = await safeReadFile(file);
      if (content === null) continue;
      try {
        const parsed = JSON.parse(content);
        if (parsed.name && typeof parsed.name === 'string') {
          localWorkspacePackages.add(parsed.name.toLowerCase());
          if (parsed.name.startsWith('@')) {
            privateScopes.add(parsed.name.split('/')[0].toLowerCase());
          }
        }
      } catch {}
      if (!isStaged) continue;
      const rel = path.relative(targetDir, file);
      packageReferences.push(...extractPackageJson(content, rel));
      continue;
    }

    if (basename === 'cargo.toml') {
      const content = await safeReadFile(file);
      if (content === null) continue;
      const nameMatch = content.match(/^\s*name\s*=\s*"([^"]+)"/m);
      if (nameMatch) {
        localWorkspacePackages.add(nameMatch[1].toLowerCase());
        localWorkspacePackages.add(nameMatch[1].toLowerCase().replace(/-/g, '_'));
      }
      if (!isStaged) continue;
      const rel = path.relative(targetDir, file);
      packageReferences.push(...extractCargoToml(content, rel));
      continue;
    }

    if (!isStaged) continue;

    if (basename.endsWith('.txt') && (basename.includes('requirements') || basename.includes('reqs') || basename.includes('constraint'))) {
      const content = await safeReadFile(file);
      if (content !== null) {
        const rel = path.relative(targetDir, file);
        packageReferences.push(...extractRequirementsTxt(content, rel));
      }
      continue;
    }

    if (basename === 'pyproject.toml') {
      const content = await safeReadFile(file);
      if (content !== null) {
        const nameMatch = content.match(/^\s*name\s*=\s*["']([^"']+)["']/m);
        if (nameMatch) {
          localPyModules.add(nameMatch[1].toLowerCase().replace(/[-_]/g, '_'));
          localPyModules.add(nameMatch[1].toLowerCase());
        }
        const rel = path.relative(targetDir, file);
        packageReferences.push(...extractPyProjectToml(content, rel));
      }
      continue;
    }

    if (basename === 'setup.cfg') {
      const content = await safeReadFile(file);
      if (content !== null) {
        const nameMatch = content.match(/^\s*name\s*=\s*(.+)$/m);
        if (nameMatch) {
          const cleanName = nameMatch[1].trim().toLowerCase();
          localPyModules.add(cleanName.replace(/[-_]/g, '_'));
          localPyModules.add(cleanName);
        }
        const rel = path.relative(targetDir, file);
        packageReferences.push(...extractSetupCfg(content, rel));
      }
      continue;
    }

    if (basename === 'pipfile') {
      const content = await safeReadFile(file);
      if (content !== null) {
        const rel = path.relative(targetDir, file);
        packageReferences.push(...extractPipfile(content, rel));
      }
      continue;
    }

    if (basename === 'setup.py') {
      const content = await safeReadFile(file);
      if (content !== null) {
        const nameMatch = content.match(/name\s*=\s*["']([^"']+)["']/);
        if (nameMatch) {
          const cleanName = nameMatch[1].trim().toLowerCase();
          localPyModules.add(cleanName.replace(/[-_]/g, '_'));
          localPyModules.add(cleanName);
        }
        const rel = path.relative(targetDir, file);
        packageReferences.push(...extractSetupPy(content, rel));
      }
      continue;
    }

    // Source files (JS, TS, React, Vue, Svelte, Astro components)
    if (['.js', '.mjs', '.cjs', '.ts', '.tsx', '.jsx', '.vue', '.svelte', '.astro'].includes(ext)) {
      const content = await safeReadFile(file);
      if (content !== null) {
        const rel = path.relative(targetDir, file);
        packageReferences.push(...extractJsImports(content, rel));
      }
      continue;
    }

    if (ext === '.py' || ext === '.pyi') {
      const content = await safeReadFile(file);
      if (content !== null) {
        const rel = path.relative(targetDir, file);
        packageReferences.push(...extractPythonImports(content, rel));
      }
      continue;
    }

    if (ext === '.rs') {
      const content = await safeReadFile(file);
      if (content !== null) {
        const rel = path.relative(targetDir, file);
        packageReferences.push(...extractRustUses(content, rel));
      }
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
      const isLocalInFileDir = ref.file ? (
        existsSync(path.resolve(targetDir, path.dirname(ref.file), ref.name)) ||
        existsSync(path.resolve(targetDir, path.dirname(ref.file), `${ref.name}.py`)) ||
        existsSync(path.resolve(targetDir, path.dirname(ref.file), `${ref.name}.pyi`))
      ) : false;
      if (localPyModules.has(lower) || dirNames.has(lower) || isLocalInFileDir) continue;
    }

    // JS/TS + Rust local workspace & local folder checks
    if (ref.ecosystem === 'npm' || ref.ecosystem === 'cargo') {
      const lowerName = ref.name.toLowerCase();
      if (localWorkspacePackages.has(lowerName)) continue;

      if (ref.ecosystem === 'cargo' && dirNames.has(lowerName)) continue;

      let isAlias = false;
      for (const alias of pathAliases) {
        if (lowerName === alias || lowerName.startsWith(alias + '/')) {
          isAlias = true;
          break;
        }
      }
      if (isAlias) continue;

      // Handle non-standard @folder/file alias convention ONLY if the target file actually exists on disk
      if (ref.ecosystem === 'npm' && ref.name.startsWith('@') && !ref.name.includes('..')) {
        const subPath = ref.name.slice(1);
        const candidatePaths = [
          path.resolve(targetDir, subPath),
          path.resolve(targetDir, 'src', subPath)
        ];
        const exts = ['', '.ts', '.tsx', '.js', '.jsx', '.vue', '.svelte', '.astro', '/index.ts', '/index.js', '/index.tsx'];
        let fileExistsOnDisk = false;
        for (const cand of candidatePaths) {
          for (const ext of exts) {
            if (existsSync(cand + ext)) {
              fileExistsOnDisk = true;
              break;
            }
          }
          if (fileExistsOnDisk) break;
        }
        if (fileExistsOnDisk) continue;
      }
    }

    const key = `${ref.ecosystem}:${ref.name.toLowerCase()}`;
    if (!uniqueTargets.has(key)) {
      uniqueTargets.set(key, ref);
    }
  }

  const targets = Array.from(uniqueTargets.values());
  const scanWarnings = traversalErrors.map((error) => ({
    name: error.path,
    ecosystem: 'scanner',
    file: path.relative(targetDir, error.path).replace(/\\/g, '/'),
    status: 'SCAN_ERROR',
    risk: 'WARN',
    exists: null,
    message: `Could not inspect path: ${error.message}`
  }));

  // Offline / privacy mode: bundled corpus answers popular packages with zero
  // network, the persistent cache replays past verdicts, everything else is an
  // honest UNKNOWN — never a faked CRITICAL or CLEAN.
  const findings = options.offline
    ? await mapConcurrent(targets, 8, async (target) => {
        if (target.ecosystem === 'npm' && target.name.startsWith('@')) {
          const scope = target.name.split('/')[0].toLowerCase();
          if (privateScopes.has(scope)) {
            return {
              ...target,
              status: 'VERIFIED',
              risk: 'CLEAN',
              exists: true,
              verifiedVia: 'private_scope',
              message: `Private enterprise scope '${scope}' (configured via .npmrc / .slopdepsrc.json).`
            };
          }
        }
        if (isPopularPackage(target.name, target.ecosystem)) {
          return {
            ...target,
            status: 'VERIFIED',
            risk: 'CLEAN',
            exists: true,
            verifiedVia: 'corpus',
            message: 'Verified offline via the bundled popularity corpus (no network call).'
          };
        }
        const cached = await cacheGet(`${target.ecosystem}:${target.name.toLowerCase()}`);
        if (cached) return { ...target, ...cached, cached: true };
        return {
          ...target,
          status: 'UNKNOWN',
          risk: 'WARN',
          exists: null,
          message: 'Offline mode: no cached verdict for this package. Run an online scan to verify.'
        };
      })
    : await mapConcurrent(targets, 8, async (target) => {
        if (target.ecosystem === 'npm' && target.name.startsWith('@')) {
          const scope = target.name.split('/')[0].toLowerCase();
          if (privateScopes.has(scope)) {
            return {
              ...target,
              status: 'VERIFIED',
              risk: 'CLEAN',
              exists: true,
              verifiedVia: 'private_scope',
              message: `Private enterprise scope '${scope}' (configured via .npmrc / .slopdepsrc.json).`
            };
          }
        }
        let check;
        if (target.ecosystem === 'npm') {
          check = await checkNpmPackage(target.name);
        } else if (target.ecosystem === 'cargo') {
          check = await checkRustPackage(target.name);
        } else {
          check = await checkPyPiPackage(target.name);
        }
        return {
          ...target,
          ...check
        };
      });

  findings.push(...scanWarnings);

  if (!options.offline) {
    await cacheFlush();
  }

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

function git(dir, args) {
  const res = spawnSync('git', args, { cwd: dir, encoding: 'utf-8', windowsHide: true });
  if (res.error || res.status !== 0) {
    const err = new Error(
      `--staged requires a git repository with staged files (git add). ${res.error ? res.error.message : (res.stderr || '').trim()}`
    );
    err.code = 'EGIT';
    throw err;
  }
  return res.stdout;
}

export async function scanStagedFiles(targetDir = process.cwd(), options = {}) {
  const topLevel = git(targetDir, ['rev-parse', '--show-toplevel']).trim();
  const listed = git(targetDir, ['diff', '--cached', '--name-only', '--diff-filter=ACMR'])
    .split('\n')
    .map(l => l.trim())
    .filter(Boolean);

  const stagedFiles = new Set();
  for (const rel of listed) {
    const abs = path.resolve(topLevel, rel).replace(/\\/g, '/');
    if (abs === path.resolve(targetDir).replace(/\\/g, '/')) continue;
    if (abs.startsWith(path.resolve(targetDir).replace(/\\/g, '/') + '/')) {
      stagedFiles.add(abs);
    }
  }

  const result = await scanDirectory(targetDir, { ...options, stagedFiles });
  result.staged = true;
  result.stagedFileCount = stagedFiles.size;
  return result;
}
