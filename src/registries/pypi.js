import { resolvePyPiDistributionName } from '../pypi-map.js';

const CACHE = new Map();

export async function checkPyPiPackage(pkgName) {
  const distName = resolvePyPiDistributionName(pkgName);
  if (CACHE.has(distName)) return CACHE.get(distName);

  const url = `https://pypi.org/pypi/${encodeURIComponent(distName)}/json`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 6000);

  try {
    const res = await fetch(url, { signal: controller.signal });

    if (res.status === 404) {
      const result = {
        name: pkgName,
        resolvedDist: distName,
        ecosystem: 'pypi',
        status: 'HALLUCINATED',
        risk: 'CRITICAL',
        exists: false,
        message: distName !== pkgName
          ? `Import '${pkgName}' maps to distribution '${distName}', which DOES NOT EXIST on PyPI. Potential AI hallucination trap!`
          : `Package '${distName}' DOES NOT EXIST on PyPI. Potential AI hallucination trap!`
      };
      CACHE.set(distName, result);
      return result;
    }

    if (!res.ok) {
      const result = {
        name: pkgName,
        ecosystem: 'pypi',
        status: 'UNKNOWN',
        risk: 'WARN',
        exists: null,
        message: `PyPI returned HTTP ${res.status}`
      };
      CACHE.set(distName, result);
      return result;
    }

    const data = await res.json();
    const releases = data.releases || {};
    const versions = Object.keys(releases);

    // Find earliest release date
    let earliestDate = null;
    for (const v of versions) {
      for (const file of releases[v] || []) {
        if (file.upload_time) {
          const d = new Date(file.upload_time);
          if (!earliestDate || d < earliestDate) earliestDate = d;
        }
      }
    }

    const ageDays = earliestDate 
      ? Math.floor((Date.now() - earliestDate.getTime()) / (1000 * 60 * 60 * 24)) 
      : 999;

    let status = 'VERIFIED';
    let risk = 'CLEAN';
    let message = 'Legitimate published PyPI package.';

    if (versions.length === 0) {
      status = 'SUSPICIOUS';
      risk = 'HIGH';
      message = 'Package exists on PyPI registry, but has 0 published releases.';
    } else if (ageDays < 30 && versions.length <= 2) {
      status = 'SUSPICIOUS';
      risk = 'HIGH';
      message = `Created recently (${ageDays}d ago) on PyPI. Review carefully.`;
    }

    const result = {
      name: pkgName,
      resolvedDist: distName,
      ecosystem: 'pypi',
      status,
      risk,
      exists: true,
      ageDays,
      versionsCount: versions.length,
      latestVersion: data.info?.version || '',
      description: data.info?.summary || '',
      message
    };
    CACHE.set(distName, result);
    return result;
  } catch (err) {
    const result = {
      name: pkgName,
      ecosystem: 'pypi',
      status: 'NETWORK_ERROR',
      risk: 'WARN',
      exists: null,
      message: `Failed to query PyPI: ${err.message}`
    };
    CACHE.set(distName, result);
    return result;
  } finally {
    clearTimeout(timeout);
  }
}
