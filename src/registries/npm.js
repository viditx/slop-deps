const CACHE = new Map();

export async function checkNpmPackage(pkgName) {
  if (CACHE.has(pkgName)) return CACHE.get(pkgName);

  // Encode scoped packages properly: @org/pkg -> @org%2Fpkg
  const encodedName = pkgName.startsWith('@') 
    ? `@${pkgName.slice(1).replace('/', '%2F')}` 
    : pkgName;

  const url = `https://registry.npmjs.org/${encodedName}`;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);

    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'Accept': 'application/vnd.npm.install-v1+json; q=1.0, application/json; q=0.8, */*'
      }
    });
    clearTimeout(timeout);

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
    const createdDate = data.time?.created ? new Date(data.time.created) : null;
    const ageDays = createdDate ? Math.floor((Date.now() - createdDate.getTime()) / (1000 * 60 * 60 * 24)) : 999;
    const versions = Object.keys(data.versions || {});

    let status = 'VERIFIED';
    let risk = 'CLEAN';
    let message = 'Legitimate published package.';

    // Brand new package detection (high risk of typo-squatting or AI-lure)
    if (ageDays < 30 && versions.length <= 2) {
      status = 'SUSPICIOUS';
      risk = 'HIGH';
      message = `Created recently (${ageDays}d ago) with only ${versions.length} release(s). Review carefully.`;
    }

    const result = {
      name: pkgName,
      ecosystem: 'npm',
      status,
      risk,
      exists: true,
      ageDays,
      versionsCount: versions.length,
      latestVersion: data['dist-tags']?.latest || versions[versions.length - 1],
      description: data.description || '',
      message
    };
    CACHE.set(pkgName, result);
    return result;
  } catch (err) {
    const result = {
      name: pkgName,
      ecosystem: 'npm',
      status: 'NETWORK_ERROR',
      risk: 'WARN',
      exists: null,
      message: `Failed to query npm: ${err.message}`
    };
    CACHE.set(pkgName, result);
    return result;
  }
}
