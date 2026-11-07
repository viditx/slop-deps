import { findTyposquatCandidate, typosquatSuggestion } from '../typosquat.js';
import { cacheGet, cacheSet } from './cache.js';

const CRATES_URL = 'https://crates.io/api/v1/crates/';
// crates.io mandates a descriptive User-Agent for API clients
const UA = 'slop-deps/1.0.0-alpha (github.com/viditx/slop-deps)';

const CACHE = new Map();
const IN_FLIGHT = new Map();

function nameVariants(name) {
  // crate names may use hyphens while `use` paths use underscores
  const a = name.toLowerCase();
  const b = a.replace(/_/g, '-');
  const c = a.replace(/-/g, '_');
  return [...new Set([a, b, c])];
}

export async function checkRustPackage(pkgName) {
  if (CACHE.has(pkgName)) return CACHE.get(pkgName);
  if (IN_FLIGHT.has(pkgName)) return IN_FLIGHT.get(pkgName);

  const clean = pkgName?.trim().toLowerCase();
  if (!clean || clean.includes('..') || clean === '.' || !/^[a-zA-Z0-9_-]+$/.test(clean)) {
    const invalid = {
      name: pkgName,
      ecosystem: 'cargo',
      status: 'INVALID',
      risk: 'WARN',
      exists: false,
      message: 'Invalid crate specifier format.'
    };
    CACHE.set(pkgName, invalid);
    return invalid;
  }

  const promise = (async () => {
    for (const key of nameVariants(clean)) {
      const persisted = await cacheGet(`cargo:${key}`);
      if (persisted) {
        CACHE.set(pkgName, persisted);
        return persisted;
      }
    }

    const variants = nameVariants(clean);
    let data = null;
    let usedName = variants[0];
    let lastStatus = null;

    for (const variant of variants) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 6000);
      try {
        const res = await fetch(`${CRATES_URL}${encodeURIComponent(variant)}`, {
          headers: { 'User-Agent': UA },
          signal: controller.signal,
        });
        lastStatus = res.status;
        if (res.status === 404) continue;
        if (!res.ok) {
          return {
            name: pkgName, ecosystem: 'cargo', status: 'UNKNOWN', risk: 'WARN', exists: null,
            message: `crates.io returned HTTP ${res.status}`
          };
        }
        data = await res.json();
        usedName = variant;
        break;
      } catch (err) {
        return {
          name: pkgName, ecosystem: 'cargo', status: 'NETWORK_ERROR', risk: 'WARN', exists: null,
          message: `Failed to query crates.io: ${err.message}`
        };
      } finally {
        clearTimeout(timer);
      }
    }

    if (!data) {
      const suggestion = typosquatSuggestion(clean, 'cargo');
      return {
        name: pkgName,
        ecosystem: 'cargo',
        status: 'HALLUCINATED',
        risk: 'CRITICAL',
        exists: false,
        message: `Crate '${clean}' DOES NOT EXIST on crates.io. Potential AI hallucination trap!`
          + (suggestion ? ` Did you mean '${suggestion}'?` : '')
      };
    }

    const crate = data.crate || {};
    const createdDate = crate.created_at ? new Date(crate.created_at) : null;
    const ageDays = createdDate ? Math.floor((Date.now() - createdDate.getTime()) / 86400000) : 999;
    const versions = crate.num_versions ?? crate.versions_count
      ?? (Array.isArray(crate.versions) ? crate.versions.length : 0);

    let status = 'VERIFIED';
    let risk = 'CLEAN';
    let message = 'Legitimate published crate.';

    const squat = findTyposquatCandidate(clean, 'cargo', ageDays);
    if (squat && squat.severity === 'suspect') {
      status = 'SUSPICIOUS';
      risk = 'HIGH';
      message = `Typosquat / supply-chain risk: name is ${squat.distance === 0 ? 'a lookalike of' : `${squat.distance} edit${squat.distance > 1 ? 's' : ''} from`} '${squat.canonical}'. Inspect before adding.`;
    } else if (squat && squat.severity === 'suggestion') {
      message = `Legitimate crate, but the name closely resembles '${squat.canonical}' — verify this dependency was intentional.`;
    } else if (versions === 0) {
      status = 'SUSPICIOUS';
      risk = 'HIGH';
      message = 'Crate exists on crates.io, but has 0 published versions.';
    } else if (ageDays < 30 && versions <= 2) {
      status = 'SUSPICIOUS';
      risk = 'HIGH';
      message = `Published recently (${ageDays}d ago) with ${versions} release(s). Review carefully.`;
    }

    return {
      name: pkgName,
      resolvedCrate: usedName,
      ecosystem: 'cargo',
      status,
      risk,
      exists: true,
      ageDays,
      versionsCount: versions,
      latestVersion: crate.max_stable_version || crate.newest_version || '',
      description: crate.description || '',
      message
    };
  })();

  IN_FLIGHT.set(pkgName, promise);
  try {
    const result = await promise;
    if (result.status !== 'NETWORK_ERROR' && result.status !== 'UNKNOWN') {
      CACHE.set(pkgName, result);
      cacheSet(`cargo:${result.resolvedCrate || clean}`, result);
    }
    return result;
  } finally {
    IN_FLIGHT.delete(pkgName);
  }
}
