const CACHE = new Map();
const IN_FLIGHT = new Map();

export async function checkNpmPackage(pkgName) {
  if (CACHE.has(pkgName)) return CACHE.get(pkgName);
  if (IN_FLIGHT.has(pkgName)) return IN_FLIGHT.get(pkgName);

  const promise = (async () => {
    // Encode scoped packages properly: @org/pkg -> @org%2Fpkg
    const encodedName = pkgName.startsWith('@') 
      ? `@${pkgName.slice(1).replace('/', '%2F')}` 
      : pkgName;

    const url = `https://registry.npmjs.org/${encodedName}`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);

    try {
      const res = await fetch(url, {
        signal: controller.signal,
        headers: {
          'Accept': 'application/json'
        }
      });

    if (res.status === 404) {
      const result = {
        name: pkgName,
        ecosystem: 'npm',
        status: 'HALLUCINATED',
        risk: 'CRITICAL',
        exists: false,
        message: 'Package DOES NOT EXIST on npm. Potential AI hallucination trap!'
      };
      CACHE.set(pkgName, result);
      return result;
    }

    if (!res.ok) {
      const result = {
        name: pkgName,
        ecosystem: 'npm',
        status: 'UNKNOWN',
        risk: 'WARN',
        exists: null,
        message: `NPM registry returned HTTP ${res.status}`
      };
      CACHE.set(pkgName, result);
      return result;
    }

    const data = await res.json();

    // Check for unpublished tombstone
    if (data.time?.unpublished) {
      const result = {
        name: pkgName,
        ecosystem: 'npm',
        status: 'HALLUCINATED',
        risk: 'CRITICAL',
        exists: false,
        message: 'Package was UNPUBLISHED from npm. No installable release exists!'
      };
      CACHE.set(pkgName, result);
      return result;
    }

    const createdDate = data.time?.created ? new Date(data.time.created) : null;
    const ageDays = createdDate ? Math.floor((Date.now() - createdDate.getTime()) / (1000 * 60 * 60 * 24)) : 999;
    const versions = Object.keys(data.versions || {});

    let status = 'VERIFIED';
    let risk = 'CLEAN';
    let message = 'Legitimate published package.';

    // Zero version anomaly or brand new package detection
    if (versions.length === 0) {
      status = 'SUSPICIOUS';
      risk = 'HIGH';
      message = 'Package exists on npm registry, but has 0 published versions.';
    } else if (ageDays < 30 && versions.length <= 2) {
      status = 'SUSPICIOUS';
      risk = 'HIGH';
      message = `Created recently (${ageDays}d ago) with only ${versions.length} release(s). Review carefully.`;
    }

    return {
        name: pkgName,
        ecosystem: 'npm',
        status,
        risk,
        exists: true,
        ageDays,
        versionsCount: versions.length,
        latestVersion: data['dist-tags']?.latest || versions[versions.length - 1] || 'none',
        description: data.description || '',
        message
      };
    } catch (err) {
      return {
        name: pkgName,
        ecosystem: 'npm',
        status: 'NETWORK_ERROR',
        risk: 'WARN',
        exists: null,
        message: `Failed to query npm: ${err.message}`
      };
    } finally {
      clearTimeout(timeout);
    }
  })();

  IN_FLIGHT.set(pkgName, promise);
  try {
    const result = await promise;
    if (result.status !== 'NETWORK_ERROR') {
      CACHE.set(pkgName, result);
    }
    return result;
  } finally {
    IN_FLIGHT.delete(pkgName);
  }
}
