import { findTyposquatCandidate, typosquatSuggestion } from '../typosquat.js';
import { cacheGet, cacheSet } from './cache.js';
import { fetchWithRetry } from './http.js';

const REPOS = {
  central: 'https://repo1.maven.org/maven2/',
  google: 'https://dl.google.com/dl/android/maven2/',
  plugins: 'https://plugins.gradle.org/m2/'
};

const UA = 'slop-deps/0.0.4 (github.com/viditx/slop-deps)';
const CACHE = new Map();
const IN_FLIGHT = new Map();

function parseMetadata(xmlText) {
  const latestMatch = xmlText.match(/<latest>(.*?)<\/latest>/) || xmlText.match(/<release>(.*?)<\/release>/);
  const latest = latestMatch ? latestMatch[1].trim() : '';

  const versionMatches = xmlText.match(/<version>(.*?)<\/version>/g) || [];
  const versionsCount = versionMatches.length;

  const updatedMatch = xmlText.match(/<lastUpdated>(.*?)<\/lastUpdated>/);
  let ageDays = 999;
  if (updatedMatch) {
    const raw = updatedMatch[1].trim();
    if (raw.length >= 8) {
      const year = parseInt(raw.slice(0, 4), 10);
      const month = parseInt(raw.slice(4, 6), 10) - 1;
      const day = parseInt(raw.slice(6, 8), 10);
      const date = new Date(Date.UTC(year, month, day));
      if (!isNaN(date.getTime())) {
        ageDays = Math.max(0, Math.floor((Date.now() - date.getTime()) / 86400000));
      }
    }
  }

  return { latest, versionsCount, ageDays };
}

export async function checkMavenPackage(pkgCoord) {
  if (CACHE.has(pkgCoord)) return CACHE.get(pkgCoord);
  if (IN_FLIGHT.has(pkgCoord)) return IN_FLIGHT.get(pkgCoord);

  const clean = pkgCoord?.trim().toLowerCase();
  const parts = clean ? clean.split(':') : [];
  if (parts.length < 2 || !parts[0] || !parts[1] || !/^[a-zA-Z0-9_.-]+$/.test(parts[0]) || !/^[a-zA-Z0-9_.-]+$/.test(parts[1])) {
    const invalid = {
      name: pkgCoord,
      ecosystem: 'maven',
      status: 'INVALID',
      risk: 'WARN',
      exists: false,
      message: 'Invalid Maven coordinate format (expected groupId:artifactId).'
    };
    CACHE.set(pkgCoord, invalid);
    return invalid;
  }

  const group = parts[0];
  const artifact = parts[1];
  const cacheKey = `maven:${clean}`;

  const promise = (async () => {
    const persisted = await cacheGet(cacheKey);
    if (persisted) {
      CACHE.set(pkgCoord, persisted);
      return persisted;
    }

    const isGoogle = group.startsWith('androidx.') || group.startsWith('com.android.') || group.startsWith('com.google.android.');
    const isPlugin = artifact.endsWith('.gradle.plugin') || group.startsWith('org.gradle.');

    const repoList = [];
    if (isPlugin) {
      repoList.push(REPOS.plugins, REPOS.google, REPOS.central);
    } else if (isGoogle) {
      repoList.push(REPOS.google, REPOS.central);
    } else {
      repoList.push(REPOS.central, REPOS.google);
    }

    const pathSuffix = `${group.replace(/\./g, '/')}/${artifact}/maven-metadata.xml`;
    let foundRepo = null;
    let metaText = null;
    const networkErrors = [];

    for (const repoUrl of repoList) {
      const fullUrl = `${repoUrl}${pathSuffix}`;

      try {
        const res = await fetchWithRetry(fullUrl, {
          headers: { 'User-Agent': UA }
        });
        if (res.status === 404) {
          continue;
        }
        if (res.ok) {
          metaText = await res.text();
          foundRepo = repoUrl;
          break;
        } else {
          networkErrors.push(`HTTP ${res.status} from ${repoUrl}`);
        }
      } catch (err) {
        networkErrors.push(err.message);
      }
    }

    if (!foundRepo || !metaText) {
      if (networkErrors.length > 0) {
        return {
          name: pkgCoord,
          ecosystem: 'maven',
          status: 'NETWORK_ERROR',
          risk: 'WARN',
          exists: null,
          message: `Failed to query Maven registries: ${networkErrors.join(', ')}`
        };
      }

      const suggestion = typosquatSuggestion(clean, 'maven');
      return {
        name: pkgCoord,
        ecosystem: 'maven',
        status: 'HALLUCINATED',
        risk: 'CRITICAL',
        exists: false,
        message: `Package '${clean}' DOES NOT EXIST on Maven / Google repositories. Potential AI hallucination trap!`
          + (suggestion ? ` Did you mean '${suggestion}'?` : '')
      };
    }

    const { latest, versionsCount, ageDays } = parseMetadata(metaText);

    let status = 'VERIFIED';
    let risk = 'CLEAN';
    let message = 'Legitimate published Maven artifact.';

    const squat = findTyposquatCandidate(clean, 'maven', ageDays);
    if (squat && squat.severity === 'suspect') {
      status = 'SUSPICIOUS';
      risk = 'HIGH';
      message = `Typosquat / supply-chain risk: coordinate is ${squat.distance === 0 ? 'a lookalike of' : `${squat.distance} edit${squat.distance > 1 ? 's' : ''} from`} '${squat.canonical}'. Inspect before adding.`;
    } else if (squat && squat.severity === 'suggestion') {
      message = `Legitimate artifact, but the coordinate closely resembles '${squat.canonical}' — verify this dependency was intentional.`;
    } else if (versionsCount === 0) {
      status = 'SUSPICIOUS';
      risk = 'HIGH';
      message = 'Artifact exists on Maven registry, but has 0 published versions.';
    } else if (ageDays < 30 && versionsCount <= 2) {
      status = 'SUSPICIOUS';
      risk = 'HIGH';
      message = `Published recently (${ageDays}d ago) with ${versionsCount} release(s). Review carefully.`;
    }

    return {
      name: pkgCoord,
      ecosystem: 'maven',
      status,
      risk,
      exists: true,
      ageDays,
      versionsCount,
      latestVersion: latest,
      repo: foundRepo,
      message
    };
  })();

  IN_FLIGHT.set(pkgCoord, promise);
  try {
    const result = await promise;
    if (result.status !== 'NETWORK_ERROR') {
      CACHE.set(pkgCoord, result);
      cacheSet(cacheKey, result);
    }
    return result;
  } finally {
    IN_FLIGHT.delete(pkgCoord);
  }
}
