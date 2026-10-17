import { resolvePyPiDistributionName } from '../pypi-map.js';

const CACHE = new Map();

export async function checkPyPiPackage(pkgName, isManifest = false) {
  const distName = resolvePyPiDistributionName(pkgName);
  const cacheKey = `${distName}:${isManifest}`;
  if (CACHE.has(cacheKey)) return CACHE.get(cacheKey);

  const url = `https://pypi.org/pypi/${encodeURIComponent(distName)}/json`;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);

    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);

    if (res.status === 404) {
      // If declared in requirements.txt or mapped canonically, 404 is CRITICAL.
      // If raw import in .py code, it could be an unmapped sub-package or internal module.
      const isCritical = isManifest || distName !== pkgName;
      const result = {
        name: pkgName,
        resolvedDist: distName,
        ecosystem: 'pypi',
        status: isCritical ? 'HALLUCINATED' : 'UNRESOLVED_IMPORT',
        risk: isCritical ? 'CRITICAL' : 'WARN',
        exists: false,
        message: isCritical
          ? `Package '${distName}' DOES NOT EXIST on PyPI. Potential AI hallucination trap!`
          : `Import '${pkgName}' unresolved on PyPI. Verify if this belongs to a multi-package distribution.`
      };
      CACHE.set(cacheKey, result);
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
      CACHE.set(pkgName, result);
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

    if (ageDays < 30 && versions.length <= 2) {
      status = 'SUSPICIOUS';
      risk = 'HIGH';
      message = `Created recently (${ageDays}d ago) on PyPI. Review carefully.`;
    }

    const result = {
      name: pkgName,
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
    CACHE.set(pkgName, result);
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
    CACHE.set(pkgName, result);
    return result;
  }
}
