import { resolvePyPiDistributionName } from '../pypi-map.js';

const CACHE = new Map();
const IN_FLIGHT = new Map();

export async function checkPyPiPackage(pkgName) {
  const distName = resolvePyPiDistributionName(pkgName);
  const cacheKey = distName.toLowerCase();

  if (CACHE.has(cacheKey)) return CACHE.get(cacheKey);
  if (IN_FLIGHT.has(cacheKey)) return IN_FLIGHT.get(cacheKey);

  const promise = (async () => {
    const url = `https://pypi.org/pypi/${encodeURIComponent(distName)}/json`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);

    try {
      const res = await fetch(url, { signal: controller.signal });

      if (res.status === 404) {
        return {
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
      }

      if (!res.ok) {
        return {
          name: pkgName,
          resolvedDist: distName,
          ecosystem: 'pypi',
          status: 'UNKNOWN',
          risk: 'WARN',
          exists: null,
          message: `PyPI returned HTTP ${res.status}`
        };
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

      return {
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
    } catch (err) {
      return {
        name: pkgName,
        resolvedDist: distName,
        ecosystem: 'pypi',
        status: 'NETWORK_ERROR',
        risk: 'WARN',
        exists: null,
        message: `Failed to query PyPI: ${err.message}`
      };
    } finally {
      clearTimeout(timeout);
    }
  })();

  IN_FLIGHT.set(cacheKey, promise);
  try {
    const result = await promise;
    if (result.status !== 'NETWORK_ERROR') {
      CACHE.set(cacheKey, result);
    }
    return result;
  } finally {
    IN_FLIGHT.delete(cacheKey);
  }
}
