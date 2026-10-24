import { findTyposquatCandidate, typosquatSuggestion } from '../typosquat.js';
import { cacheGet, cacheSet } from './cache.js';

const CACHE = new Map();
const IN_FLIGHT = new Map();

export async function checkNpmPackage(pkgName) {
  if (CACHE.has(pkgName)) return CACHE.get(pkgName);
  if (IN_FLIGHT.has(pkgName)) return IN_FLIGHT.get(pkgName);

  const clean = pkgName?.trim();
  if (!clean || clean.includes('..') || clean === '.' || !/^(?:@[a-z0-9_.-]+\/)?[a-z0-9_.-]+$/i.test(clean)) {
    const invalidResult = {
      name: pkgName,
      ecosystem: 'npm',
      status: 'INVALID',
      risk: 'WARN',
      exists: false,
      message: 'Invalid package specifier format.'
    };
    CACHE.set(pkgName, invalidResult);
    return invalidResult;
  }

  const persisted = await cacheGet(`npm:${clean.toLowerCase()}`);
  if (persisted) {
    CACHE.set(pkgName, persisted);
    return persisted;
  }

  const promise = (async () => {
    // Encode scoped packages properly: @org/pkg -> @org%2Fpkg
    const encodedName = clean.startsWith('@') 
      ? `@${clean.slice(1).replace('/', '%2F')}` 
      : clean;

    const url = `https://registry.npmjs.org/${encodedName}`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);

    try {
      const res = await fetch(url, {
        signal: controller.signal,
        headers: {
          'Accept': 'application/vnd.npm.install-v1+json, application/json;q=0.9'
        }
      });

    if (res.status === 404) {
      const suggestion = typosquatSuggestion(clean, 'npm');
      const result = {
        name: pkgName,
        ecosystem: 'npm',
        status: 'HALLUCINATED',
        risk: 'CRITICAL',
        exists: false,
        message: `Package DOES NOT EXIST on npm. Potential AI hallucination trap!`
          + (suggestion ? ` Did you mean '${suggestion}'?` : '')
      };
      CACHE.set(pkgName, result);
      return result;
    }

    if (!res.ok) {
      return {
        name: pkgName,
        ecosystem: 'npm',
        status: 'UNKNOWN',
        risk: 'WARN',
        exists: null,
        message: `NPM registry returned HTTP ${res.status}`
      };
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
    const latestTag = data['dist-tags']?.latest;
    const latestScripts = (latestTag && data.versions?.[latestTag]?.scripts) || null;
    const hasInstallScripts = Boolean(
      latestScripts && (latestScripts.install || latestScripts.preinstall || latestScripts.postinstall || latestScripts.prepare)
    );

    let status = 'VERIFIED';
    let risk = 'CLEAN';
    let message = 'Legitimate published package.';
    let signals = [];

    // Typosquat: name is one or two edits from a hugely popular package
    const squat = findTyposquatCandidate(clean, 'npm', ageDays);
    if (squat && squat.severity === 'suspect') {
      signals.push(
        squat.distance === 0
          ? `name uses lookalike characters of '${squat.canonical}'`
          : `name is ${squat.distance} edit${squat.distance > 1 ? 's' : ''} from '${squat.canonical}'`
      );
    }

    if (hasInstallScripts && ageDays < 365 && versions.length <= 3) {
      signals.push('runs install scripts');
    }

    if (signals.length > 0) {
      status = 'SUSPICIOUS';
      risk = 'HIGH';
      message = `Typosquat / supply-chain risk signals: ${signals.join(' + ')}. Inspect before installing.`;
    } else if (squat && squat.severity === 'suggestion') {
      message = `Legitimate package, but the name closely resembles '${squat.canonical}' — verify this import was intentional.`;
    } else if (versions.length === 0) {
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
        latestVersion: latestTag || versions[versions.length - 1] || 'none',
        description: data.description || '',
        hasInstallScripts,
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
    if (result.status !== 'NETWORK_ERROR' && result.status !== 'UNKNOWN') {
      CACHE.set(pkgName, result);
      cacheSet(`npm:${clean.toLowerCase()}`, result);
    }
    return result;
  } finally {
    IN_FLIGHT.delete(pkgName);
  }
}
