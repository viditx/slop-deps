import {
  clearRegistryCache,
  detectFileEcosystem,
  inspectDroppedFileAsync,
  type FileEcosystem,
  type InspectOptions,
} from '../utils/fileInspector';
import type { FileScanResult, PackageResult, Verdict } from './types';

export type { FileScanResult, PackageResult, Verdict } from './types';
export { clearRegistryCache };

const VALID_VERDICTS = new Set<Verdict>([
  'HALLUCINATED',
  'SUSPICIOUS',
  'VERIFIED',
  'UNCHECKED',
]);

const VALID_ECOSYSTEMS = new Set<'npm' | 'pypi' | 'crates'>([
  'npm',
  'pypi',
  'crates',
]);

function createEmptyCounts(): Record<Verdict, number> {
  return {
    HALLUCINATED: 0,
    SUSPICIOUS: 0,
    VERIFIED: 0,
    UNCHECKED: 0,
  };
}

function classifyManifestError(
  fileName: string,
  ecosystem: 'npm' | 'pypi' | 'crates',
  rawContent: string
): 'invalid' | 'empty' | undefined {
  if (rawContent.includes('\0')) {
    return 'invalid';
  }

  const trimmed = rawContent.trim();
  if (trimmed.length === 0) {
    return 'empty';
  }

  const lower = fileName.trim().toLowerCase();

  // Strict JSON check ONLY for package.json
  if (lower.endsWith('package.json')) {
    try {
      const parsed = JSON.parse(rawContent);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        return 'invalid';
      }
      return undefined;
    } catch {
      return 'invalid';
    }
  }

  // Strict TOML check ONLY for *.toml
  if (lower.endsWith('.toml')) {
    const activeLines = rawContent
      .split(/\r?\n/)
      .map((l) => l.replace(/#.*$/, '').trim())
      .filter(Boolean);

    if (activeLines.length === 0) {
      return 'empty';
    }

    const hasMalformedHeader = activeLines.some(
      (l) => l.startsWith('[') && !/^\[(\[[^\[\]\r\n]+\]|[^\[\]\r\n]+)\]$/.test(l)
    );
    const hasTomlSyntax = activeLines.some(
      (l) => /^\[(\[[^\[\]\r\n]+\]|[^\[\]\r\n]+)\]$/.test(l) || /^[A-Za-z0-9_.-]+\s*=/.test(l)
    );

    if (hasMalformedHeader || !hasTomlSyntax) {
      return 'invalid';
    }
    return undefined;
  }

  // requirements*.txt
  if (lower.endsWith('requirements.txt') || /requirements.*\.txt$/.test(lower)) {
    const activeReqLines = rawContent
      .split(/\r?\n/)
      .map((l) => l.replace(/(^|\s)#.*$/, '').trim())
      .filter((l) => l.length > 0 && !l.startsWith('-'));

    if (activeReqLines.length === 0) {
      return 'empty';
    }
    return undefined;
  }

  return undefined;
}

/**
 * Thin adapter over inspectDroppedFileAsync conforming to the shared scanner contract.
 * Never throws; unmappable fields default to UNCHECKED, and VERIFIED requires registryChecked === true.
 */
export async function scanFile(
  file: File,
  onPackage?: (p: PackageResult) => void,
  options?: InspectOptions
): Promise<FileScanResult> {
  const start = performance.now();
  const counts = createEmptyCounts();
  const fileName = file?.name ?? 'unknown';
  let ecosystem: FileEcosystem = detectFileEcosystem(fileName);

  try {
    if (file && typeof file.size === 'number' && file.size > 2_000_000) {
      return {
        fileName,
        ecosystem,
        packages: [],
        counts,
        durationMs: Math.max(0, Math.round(performance.now() - start)),
        error: 'too_large',
      };
    }

    if (!file || typeof file.text !== 'function') {
      return {
        fileName,
        ecosystem,
        packages: [],
        counts,
        durationMs: Math.max(0, Math.round(performance.now() - start)),
        error: 'invalid',
      };
    }

    let rawContent: string;
    try {
      rawContent = await file.text();
    } catch {
      return {
        fileName,
        ecosystem,
        packages: [],
        counts,
        durationMs: Math.max(0, Math.round(performance.now() - start)),
        error: 'invalid',
      };
    }

    // Detect ecosystem with rawContent sniffing fallback
    ecosystem = detectFileEcosystem(fileName, rawContent);

    if (ecosystem === 'unknown') {
      return {
        fileName,
        ecosystem,
        packages: [],
        counts,
        durationMs: Math.max(0, Math.round(performance.now() - start)),
        error: 'unsupported',
      };
    }

    const preError = classifyManifestError(fileName, ecosystem, rawContent);
    if (preError) {
      return {
        fileName,
        ecosystem,
        packages: [],
        counts,
        durationMs: Math.max(0, Math.round(performance.now() - start)),
        error: preError,
      };
    }

    const record = await inspectDroppedFileAsync(
      fileName,
      typeof file.size === 'number' ? file.size : rawContent.length,
      rawContent,
      `${fileName}-${Date.now()}`,
      options
    );

    if (!record.packages || record.packages.length === 0) {
      const lower = fileName.trim().toLowerCase();
      const isReqTxt =
        lower.endsWith('requirements.txt') ||
        /requirements.*\.txt$/.test(lower);
      const isManifest =
        lower.endsWith('package.json') ||
        isReqTxt ||
        lower.endsWith('pyproject.toml') ||
        lower.endsWith('cargo.toml') ||
        lower.endsWith('pipfile') ||
        lower.endsWith('setup.cfg');

      if (isManifest) {
        return {
          fileName,
          ecosystem: record.ecosystem || ecosystem,
          packages: [],
          counts,
          durationMs: Math.max(0, Math.round(performance.now() - start)),
          error: isReqTxt ? 'invalid' : 'empty',
        };
      }

      // Valid clean source file (.js, .ts, .py, .rs, .html, etc.) with 0 external packages
      return {
        fileName,
        ecosystem: record.ecosystem || ecosystem,
        packages: [],
        counts,
        durationMs: Math.max(0, Math.round(performance.now() - start)),
        error: undefined,
      };
    }

    const packages: PackageResult[] = [];

    for (const rawPkg of record.packages) {
      const normalizedEco =
        rawPkg.ecosystem === 'cargo' ? 'crates' : rawPkg.ecosystem;
      const hasValidEco = VALID_ECOSYSTEMS.has(normalizedEco);
      const mappedEco: 'npm' | 'pypi' | 'crates' = hasValidEco
        ? normalizedEco
        : (ecosystem as 'npm' | 'pypi' | 'crates');

      let verdict: Verdict = VALID_VERDICTS.has(rawPkg.verdict as Verdict)
        ? (rawPkg.verdict as Verdict)
        : 'UNCHECKED';

      // Never show VERIFIED unless registry checked or verified via bundled popularity corpus
      if (verdict === 'VERIFIED' && !rawPkg.registryChecked) {
        verdict = 'UNCHECKED';
      }

      if (!rawPkg.name || typeof rawPkg.name !== 'string' || !hasValidEco) {
        verdict = 'UNCHECKED';
      }

      const pkgResult: PackageResult = {
        name: rawPkg.name || 'unknown',
        version: rawPkg.version || 'latest',
        ecosystem: mappedEco,
        verdict,
        reason: rawPkg.reason || (rawPkg.isBuiltin ? 'builtin module' : undefined),
        suggestion: rawPkg.resembles || undefined,
      };

      packages.push(pkgResult);
      counts[verdict] = (counts[verdict] || 0) + 1;

      if (onPackage) {
        try {
          onPackage(pkgResult);
        } catch {
          // Never allow callback errors to break scanFile
        }
      }
    }

    return {
      fileName,
      ecosystem: record.ecosystem || ecosystem,
      packages,
      counts,
      durationMs: Math.max(0, Math.round(performance.now() - start)),
    };
  } catch {
    return {
      fileName,
      ecosystem,
      packages: [],
      counts,
      durationMs: Math.max(0, Math.round(performance.now() - start)),
      error: 'invalid',
    };
  }
}
