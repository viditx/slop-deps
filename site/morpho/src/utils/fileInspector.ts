import {
  extractCargoToml,
  extractPackageJson,
  extractPyProjectToml,
  extractRequirementsTxt,
} from '../vendor/slop-deps/manifests.js';
import { extractJsImports } from '../vendor/slop-deps/js-ts.js';
import { extractPythonImports } from '../vendor/slop-deps/python.js';
import { extractRustUses } from '../vendor/slop-deps/rust.js';
import {
  findTyposquatCandidate,
  isPopularPackage,
} from '../vendor/slop-deps/typosquat.js';
import { isBuiltin } from '../vendor/slop-deps/builtins.js';
import { normalizePypiName } from '../vendor/slop-deps/pypi-map.js';

export type FileEcosystem = 'npm' | 'pypi' | 'crates' | 'unknown';

export type PackageVerdict =
  | 'HALLUCINATED'
  | 'SUSPICIOUS'
  | 'VERIFIED'
  | 'UNCHECKED';

export type RegistryLookupResult =
  | 'exists'
  | 'not_found'
  | 'offline_error'
  | 'skipped_crates'
  | 'skipped_builtin';

export interface InspectedPackage {
  name: string;
  version: string;
  ecosystem: 'npm' | 'pypi' | 'crates';
  verdict: PackageVerdict;
  resembles?: string;
  isBuiltin?: boolean;
  registryChecked: boolean;
  reason?: string;
}

export interface DroppedFileRecord {
  id: string;
  name: string;
  sizeBytes: number;
  sizeFormatted: string;
  ecosystem: FileEcosystem;
  lineCount: number;
  packages: InspectedPackage[];
  hallucinatedCount: number;
  suspiciousCount: number;
  verifiedCount: number;
  uncheckedCount: number;
  offlineMode: boolean;
  cratesOfflineNotice: boolean;
  scanStatus: 'scanning' | 'complete';
  modeLabel?: string;
}

export interface InspectOptions {
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  concurrency?: number;
}

const REGISTRY_TIMEOUT_MS = 4000;
const MAX_CONCURRENT_REQUESTS = 6;

// In-memory cache for registry existence checks ('npm:react' -> 'exists' | 'not_found')
const registryCache = new Map<string, 'exists' | 'not_found'>();

let cachedCorpusPromise: Promise<Record<string, string[]>> | null = null;

/**
 * Lazy-loads the popular package corpus via dynamic import on the first file drop.
 */
export async function loadCorpusLazy(): Promise<Record<string, string[]>> {
  if (!cachedCorpusPromise) {
    cachedCorpusPromise = import('../vendor/slop-deps/corpus.generated.js').then(
      (mod) => mod.CORPUS || mod.default
    );
  }
  return cachedCorpusPromise;
}

export function clearRegistryCache(): void {
  registryCache.clear();
}

export function formatByteSize(bytes: number): string {
  if (bytes < 1024) return `${Math.max(0, Math.floor(bytes))} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export function detectFileEcosystem(fileName: string, rawContent?: string): FileEcosystem {
  const lower = fileName.trim().toLowerCase();

  // npm & web files (manifests, HTML, JS/TS, UI components)
  if (
    lower.endsWith('package.json') ||
    lower.endsWith('.html') ||
    lower.endsWith('.htm') ||
    lower.endsWith('.js') ||
    lower.endsWith('.jsx') ||
    lower.endsWith('.ts') ||
    lower.endsWith('.tsx') ||
    lower.endsWith('.mjs') ||
    lower.endsWith('.cjs') ||
    lower.endsWith('.vue') ||
    lower.endsWith('.svelte')
  ) {
    return 'npm';
  }

  // Python files (manifests & sources)
  if (
    lower.endsWith('requirements.txt') ||
    lower.endsWith('pyproject.toml') ||
    lower.endsWith('pipfile') ||
    lower.endsWith('setup.py') ||
    lower.endsWith('setup.cfg') ||
    lower.endsWith('.py') ||
    lower.endsWith('.pyw') ||
    /requirements.*\.txt$/.test(lower)
  ) {
    return 'pypi';
  }

  // Rust files (Cargo manifest & sources)
  if (lower.endsWith('cargo.toml') || lower.endsWith('.rs')) {
    return 'crates';
  }

  // Content-sniffing fallback if extension is generic (e.g. Dockerfile, .txt, or nameless)
  if (rawContent) {
    const trimmed = rawContent.trim();
    if (trimmed.startsWith('<') && (trimmed.includes('<html') || trimmed.includes('<script'))) {
      return 'npm';
    }
    if (trimmed.startsWith('{') && (trimmed.includes('"dependencies"') || trimmed.includes('"devDependencies"'))) {
      return 'npm';
    }
    if (trimmed.includes('import ') && (trimmed.includes('from ') || trimmed.includes('require('))) {
      return 'npm';
    }
    if (trimmed.includes('def ') || (trimmed.includes('import ') && trimmed.includes('print('))) {
      return 'pypi';
    }
    if (trimmed.includes('fn ') && trimmed.includes('use ')) {
      return 'crates';
    }
  }

  return 'unknown';
}

/**
 * Extracts external packages from HTML files:
 * 1. <script type="importmap"> JSON definitions
 * 2. CDN script tags (jsdelivr, unpkg, esm.sh, skypack)
 * 3. Inline <script> import & require statements
 */
export function extractHtmlDependencies(
  htmlContent: string
): Array<{ name: string; version: string; ecosystem: 'npm' }> {
  const pkgs = new Map<string, { name: string; version: string; ecosystem: 'npm' }>();

  // 1. Script type="importmap"
  const importMapRegex = /<script\b[^>]*\btype=["']importmap["'][^>]*>([\s\S]*?)<\/script>/gi;
  let mapMatch: RegExpExecArray | null;
  while ((mapMatch = importMapRegex.exec(htmlContent)) !== null) {
    try {
      const parsed = JSON.parse(mapMatch[1]);
      if (parsed?.imports && typeof parsed.imports === 'object') {
        for (const key of Object.keys(parsed.imports)) {
          const clean = key.trim();
          if (clean && !clean.startsWith('.') && !clean.startsWith('/') && !clean.startsWith('#')) {
            const root = clean.startsWith('@')
              ? clean.split('/').slice(0, 2).join('/')
              : clean.split('/')[0];
            pkgs.set(root.toLowerCase(), { name: root, version: '*', ecosystem: 'npm' });
          }
        }
      }
    } catch {
      // ignore malformed JSON importmap
    }
  }

  // 2. CDN Script tags (jsdelivr, unpkg, esm.sh, skypack)
  const scriptSrcRegex = /<script\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi;
  let srcMatch: RegExpExecArray | null;
  while ((srcMatch = scriptSrcRegex.exec(htmlContent)) !== null) {
    const src = srcMatch[1];
    // jsdelivr: https://cdn.jsdelivr.net/npm/package-name@version/...
    const jsdelivr = src.match(/(?:cdn\.)?jsdelivr\.net\/(?:npm|gh)\/(@?[^@\/\s"']+)(?:@[^\/\s"']+)?/);
    if (jsdelivr && jsdelivr[1]) {
      const name = jsdelivr[1].split('/')[0];
      pkgs.set(name.toLowerCase(), { name, version: '*', ecosystem: 'npm' });
      continue;
    }
    // unpkg: https://unpkg.com/package-name@version/...
    const unpkg = src.match(/unpkg\.com\/(@?[^@\/\s"']+)(?:@[^\/\s"']+)?/);
    if (unpkg && unpkg[1]) {
      const name = unpkg[1].startsWith('@')
        ? unpkg[1].split('/').slice(0, 2).join('/')
        : unpkg[1].split('/')[0];
      pkgs.set(name.toLowerCase(), { name, version: '*', ecosystem: 'npm' });
      continue;
    }
    // esm.sh: https://esm.sh/package-name@version
    const esm = src.match(/esm\.sh\/(@?[^@\/\s"']+)(?:@[^\/\s"']+)?/);
    if (esm && esm[1]) {
      const name = esm[1].startsWith('@')
        ? esm[1].split('/').slice(0, 2).join('/')
        : esm[1].split('/')[0];
      pkgs.set(name.toLowerCase(), { name, version: '*', ecosystem: 'npm' });
      continue;
    }
    // skypack: https://cdn.skypack.dev/package-name
    const skypack = src.match(/cdn\.skypack\.dev\/(@?[^@\/\s"']+)(?:@[^\/\s"']+)?/);
    if (skypack && skypack[1]) {
      const name = skypack[1].startsWith('@')
        ? skypack[1].split('/').slice(0, 2).join('/')
        : skypack[1].split('/')[0];
      pkgs.set(name.toLowerCase(), { name, version: '*', ecosystem: 'npm' });
      continue;
    }
  }

  // 3. Inline scripts: <script> ... imports ... </script>
  const inlineScriptRegex = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi;
  let inlineMatch: RegExpExecArray | null;
  while ((inlineMatch = inlineScriptRegex.exec(htmlContent)) !== null) {
    const code = inlineMatch[1];
    if (code && !inlineMatch[0].includes('importmap') && !inlineMatch[0].includes('application/json')) {
      try {
        const extracted = (extractJsImports as any)(code, 'inline.js');
        if (extracted) {
          const values = extracted.values ? Array.from(extracted.values()) : Object.values(extracted);
          for (const item of values as any[]) {
            if (item?.name) {
              pkgs.set(item.name.toLowerCase(), { name: item.name, version: '*', ecosystem: 'npm' });
            }
          }
        }
      } catch {
        // ignore inline script errors
      }
    }
  }

  return Array.from(pkgs.values());
}

/**
 * Extracts dependency and import entries using slop-deps extractors across:
 * - Manifests: package.json, requirements.txt, pyproject.toml, Cargo.toml
 * - Web/HTML: .html, .htm (script tags, importmap, inline code)
 * - JavaScript/TypeScript: .js, .jsx, .ts, .tsx, .mjs, .cjs, .vue, .svelte
 * - Python: .py, .pyw, setup.py
 * - Rust: .rs
 */
export function extractManifestDependencies(
  fileName: string,
  rawContent: string
): Array<{ name: string; version: string; ecosystem: 'npm' | 'pypi' | 'crates' }> {
  const lower = fileName.trim().toLowerCase();

  // 1. HTML files
  if (lower.endsWith('.html') || lower.endsWith('.htm')) {
    return extractHtmlDependencies(rawContent);
  }

  // 2. npm package.json
  if (lower.endsWith('package.json')) {
    return extractPackageJson(rawContent) as Array<{
      name: string;
      version: string;
      ecosystem: 'npm';
    }>;
  }

  // 3. JS/TS source files
  if (
    lower.endsWith('.js') ||
    lower.endsWith('.jsx') ||
    lower.endsWith('.ts') ||
    lower.endsWith('.tsx') ||
    lower.endsWith('.mjs') ||
    lower.endsWith('.cjs') ||
    lower.endsWith('.vue') ||
    lower.endsWith('.svelte')
  ) {
    try {
      const extracted = (extractJsImports as any)(rawContent, fileName);
      if (extracted) {
        const values = extracted.values ? Array.from(extracted.values()) : Object.values(extracted);
        const pkgs = new Map<string, { name: string; version: string; ecosystem: 'npm' }>();
        for (const item of values as any[]) {
          if (item?.name) {
            pkgs.set(item.name.toLowerCase(), { name: item.name, version: '*', ecosystem: 'npm' });
          }
        }
        return Array.from(pkgs.values());
      }
    } catch {
      return [];
    }
  }

  // 4. PyPI pyproject.toml
  if (lower.endsWith('pyproject.toml')) {
    return extractPyProjectToml(rawContent) as Array<{
      name: string;
      version: string;
      ecosystem: 'pypi';
    }>;
  }

  // 5. PyPI requirements.txt
  if (
    lower.endsWith('requirements.txt') ||
    /requirements.*\.txt$/.test(lower)
  ) {
    return extractRequirementsTxt(rawContent) as Array<{
      name: string;
      version: string;
      ecosystem: 'pypi';
    }>;
  }

  // 6. Python source files (.py, .pyw, setup.py)
  if (lower.endsWith('.py') || lower.endsWith('.pyw')) {
    try {
      const extracted = (extractPythonImports as any)(rawContent, fileName);
      if (extracted) {
        const values = extracted.values ? Array.from(extracted.values()) : Object.values(extracted);
        const pkgs = new Map<string, { name: string; version: string; ecosystem: 'pypi' }>();
        for (const item of values as any[]) {
          if (item?.name) {
            pkgs.set(item.name.toLowerCase(), { name: item.name, version: '*', ecosystem: 'pypi' });
          }
        }
        return Array.from(pkgs.values());
      }
    } catch {
      return [];
    }
  }

  // 7. Rust Cargo.toml
  if (lower.endsWith('cargo.toml')) {
    return extractCargoToml(rawContent) as Array<{
      name: string;
      version: string;
      ecosystem: 'crates';
    }>;
  }

  // 8. Rust source files (.rs)
  if (lower.endsWith('.rs')) {
    try {
      const extracted = (extractRustUses as any)(rawContent, fileName);
      if (extracted) {
        const values = extracted.values ? Array.from(extracted.values()) : Object.values(extracted);
        const pkgs = new Map<string, { name: string; version: string; ecosystem: 'crates' }>();
        for (const item of values as any[]) {
          if (item?.name) {
            pkgs.set(item.name.toLowerCase(), { name: item.name, version: '*', ecosystem: 'crates' });
          }
        }
        return Array.from(pkgs.values());
      }
    } catch {
      return [];
    }
  }

  return [];
}

// Module-level global semaphore: max 6 active in-flight network requests across all concurrent file drops
const MAX_GLOBAL_INFLIGHT = 6;
let activeInFlightCount = 0;
const inFlightQueue: Array<() => void> = [];

async function acquireRegistrySlot(): Promise<() => void> {
  if (activeInFlightCount < MAX_GLOBAL_INFLIGHT) {
    activeInFlightCount++;
    return releaseRegistrySlot;
  }
  return new Promise<() => void>((resolve) => {
    inFlightQueue.push(() => {
      resolve(releaseRegistrySlot);
    });
  });
}

function releaseRegistrySlot(): void {
  activeInFlightCount--;
  if (inFlightQueue.length > 0 && activeInFlightCount < MAX_GLOBAL_INFLIGHT) {
    activeInFlightCount++;
    const next = inFlightQueue.shift();
    if (next) next();
  }
}

/**
 * Queries npm or PyPI directly from the browser with a 4s timeout and in-memory caching.
 * Note: crates.io requires a custom User-Agent header forbidden in browser fetch, so crates skip network lookup.
 */
async function checkPackageInRegistry(
  name: string,
  ecosystem: 'npm' | 'pypi' | 'crates',
  fetchImpl: typeof fetch,
  timeoutMs: number
): Promise<RegistryLookupResult> {
  if (ecosystem === 'crates') {
    return 'skipped_crates';
  }
  if (name.startsWith('node:')) {
    return 'skipped_builtin';
  }

  const normalized =
    ecosystem === 'pypi' ? normalizePypiName(name) : name.trim();
  const cacheKey = `${ecosystem}:${normalized.toLowerCase()}`;

  const cached = registryCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const release = await acquireRegistrySlot();
  const url =
    ecosystem === 'npm'
      ? `https://registry.npmjs.org/${encodeURIComponent(normalized)}`
      : `https://pypi.org/pypi/${encodeURIComponent(normalized)}/json`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetchImpl(url, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });

    if (response.status === 404) {
      registryCache.set(cacheKey, 'not_found');
      return 'not_found';
    }

    if (response.ok) {
      registryCache.set(cacheKey, 'exists');
      return 'exists';
    }

    return 'offline_error';
  } catch {
    return 'offline_error';
  } finally {
    clearTimeout(timer);
    release();
  }
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;

  const runners = Array.from(
    { length: Math.min(Math.max(1, concurrency), items.length) },
    async () => {
      while (cursor < items.length) {
        const idx = cursor++;
        results[idx] = await worker(items[idx], idx);
      }
    }
  );

  await Promise.all(runners);
  return results;
}

/**
 * Full async slop-deps inspection pipeline:
 * 1. Lazy-loads the corpus via dynamic import on first invocation.
 * 2. Extracts dependencies with slop-deps extractors.
 * 3. Runs builtin check (builtins.js), typosquat check (typosquat.js + corpus), and live registry check (npm/PyPI, max 6 concurrent, 4s timeout, cached).
 * 4. Produces strict verdicts: HALLUCINATED, SUSPICIOUS, VERIFIED, or UNCHECKED.
 */
export async function inspectDroppedFileAsync(
  fileName: string,
  sizeBytes: number,
  rawContent: string,
  id = `${fileName}-${sizeBytes}`,
  options: InspectOptions = {}
): Promise<DroppedFileRecord> {
  const fetchImpl =
    options.fetchImpl ||
    (typeof globalThis.fetch === 'function'
      ? globalThis.fetch.bind(globalThis)
      : undefined);
  const timeoutMs = options.timeoutMs ?? REGISTRY_TIMEOUT_MS;
  const concurrency = options.concurrency ?? MAX_CONCURRENT_REQUESTS;

  const ecosystem = detectFileEcosystem(fileName, rawContent);
  const lineCount =
    rawContent.length === 0 ? 0 : rawContent.split(/\r?\n/).length;
  const extracted = extractManifestDependencies(fileName, rawContent);

  if (extracted.length === 0) {
    return {
      id,
      name: fileName,
      sizeBytes,
      sizeFormatted: formatByteSize(sizeBytes),
      ecosystem,
      lineCount,
      packages: [],
      hallucinatedCount: 0,
      suspiciousCount: 0,
      verifiedCount: 0,
      uncheckedCount: 0,
      offlineMode: false,
      cratesOfflineNotice: ecosystem === 'crates',
      scanStatus: 'complete',
      modeLabel:
        ecosystem === 'crates'
          ? 'crates.io · offline typosquat check only (browser cannot set custom User-Agent)'
          : undefined,
    };
  }

  const corpus = await loadCorpusLazy();
  let hadOfflineError = false;

  const packages = await mapWithConcurrency(
    extracted,
    concurrency,
    async (dep): Promise<InspectedPackage> => {
      const pkgName = dep.name;
      const pkgEco = dep.ecosystem;

      // 1. Builtin check
      // REGRESSION CHECK: node:fs, node:path, os, sys, json must all be VERIFIED
      if (isBuiltin(pkgName, pkgEco)) {
        return {
          name: pkgName,
          version: dep.version,
          ecosystem: pkgEco,
          verdict: 'VERIFIED',
          isBuiltin: true,
          registryChecked: true,
          reason: 'standard library module',
        };
      }

      // 2. Typosquat check against lazy-loaded corpus
      const popular = isPopularPackage(pkgName, pkgEco, corpus as any);
      const typosquat = popular
        ? null
        : findTyposquatCandidate(pkgName, pkgEco, corpus as any);

      // Crates ecosystem (no live registry lookup in browser)
      if (pkgEco === 'crates') {
        if (typosquat && typosquat.target) {
          return {
            name: pkgName,
            version: dep.version,
            ecosystem: pkgEco,
            verdict: 'SUSPICIOUS',
            resembles: typosquat.target,
            isBuiltin: false,
            registryChecked: false,
            reason: `resembles ${typosquat.target}`,
          };
        }
        return {
          name: pkgName,
          version: dep.version,
          ecosystem: pkgEco,
          verdict: 'UNCHECKED',
          isBuiltin: false,
          registryChecked: false,
          reason: 'crates.io offline typosquat check only',
        };
      }

      if (!fetchImpl) {
        hadOfflineError = true;
        return {
          name: pkgName,
          version: dep.version,
          ecosystem: pkgEco,
          verdict: 'UNCHECKED',
          isBuiltin: false,
          registryChecked: false,
          reason: 'offline mode (registry lookup unavailable)',
        };
      }

      const lookup = await checkPackageInRegistry(
        pkgName,
        pkgEco,
        fetchImpl,
        timeoutMs
      );

      if (lookup === 'skipped_builtin') {
        return {
          name: pkgName,
          version: dep.version,
          ecosystem: pkgEco,
          verdict: 'VERIFIED',
          isBuiltin: true,
          registryChecked: true,
          reason: 'standard library module',
        };
      }

      if (lookup === 'not_found') {
        return {
          name: pkgName,
          version: dep.version,
          ecosystem: pkgEco,
          verdict: 'HALLUCINATED',
          isBuiltin: false,
          resembles: typosquat?.target,
          registryChecked: true,
          reason: typosquat?.target
            ? `package not found (resembles '${typosquat.target}')`
            : 'package not found on public registry (404)',
        };
      }

      if (lookup === 'exists') {
        if (typosquat && typosquat.target) {
          return {
            name: pkgName,
            version: dep.version,
            ecosystem: pkgEco,
            verdict: 'VERIFIED',
            resembles: typosquat.target,
            isBuiltin: false,
            registryChecked: true,
            reason: `closely resembles '${typosquat.target}': verify this import was intentional`,
          };
        }
        return {
          name: pkgName,
          version: dep.version,
          ecosystem: pkgEco,
          verdict: 'VERIFIED',
          isBuiltin: false,
          registryChecked: true,
          reason: 'public registry verified',
        };
      }

      hadOfflineError = true;
      return {
        name: pkgName,
        version: dep.version,
        ecosystem: pkgEco,
        verdict: 'UNCHECKED',
        isBuiltin: false,
        registryChecked: false,
        reason: 'offline / lookup failed',
      };
    }
  );

  let hallucinatedCount = 0;
  let suspiciousCount = 0;
  let verifiedCount = 0;
  let uncheckedCount = 0;

  for (const p of packages) {
    if (p.verdict === 'HALLUCINATED') hallucinatedCount++;
    else if (p.verdict === 'SUSPICIOUS') suspiciousCount++;
    else if (p.verdict === 'VERIFIED') verifiedCount++;
    else uncheckedCount++;
  }

  return {
    id,
    name: fileName,
    sizeBytes,
    sizeFormatted: formatByteSize(sizeBytes),
    ecosystem,
    lineCount,
    packages,
    hallucinatedCount,
    suspiciousCount,
    verifiedCount,
    uncheckedCount,
    offlineMode: hadOfflineError,
    cratesOfflineNotice: ecosystem === 'crates',
    scanStatus: 'complete',
    modeLabel:
      ecosystem === 'crates'
        ? 'crates.io · offline typosquat check only (browser cannot set custom User-Agent)'
        : hadOfflineError
        ? 'offline / network restricted (unverified packages marked unchecked)'
        : undefined,
  };
}
