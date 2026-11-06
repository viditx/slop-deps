// Pure ESM typosquat detection using Damerau-Levenshtein distance & delimiter normalization (zero Node builtin imports)
import { normalizePypiName } from './pypi-map.js';

function normalizeName(name, ecosystem) {
  if (!name) return '';
  const trimmed = String(name).trim().toLowerCase();
  if (ecosystem === 'pypi') {
    return normalizePypiName(trimmed);
  }
  return trimmed;
}

/**
 * Computes optimal string alignment (Damerau-Levenshtein) distance between two strings,
 * handling single-character insertions, deletions, substitutions, and adjacent transpositions (e.g. lodahs <-> lodash).
 */
export function damerauLevenshtein(a, b) {
  const lenA = a.length;
  const lenB = b.length;
  if (a === b) return 0;
  if (lenA === 0) return lenB;
  if (lenB === 0) return lenA;
  if (Math.abs(lenA - lenB) > 3) return Math.abs(lenA - lenB);

  const dp = Array.from({ length: lenA + 1 }, () => new Int32Array(lenB + 1));

  for (let i = 0; i <= lenA; i++) dp[i][0] = i;
  for (let j = 0; j <= lenB; j++) dp[0][j] = j;

  for (let i = 1; i <= lenA; i++) {
    for (let j = 1; j <= lenB; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let best = Math.min(
        dp[i - 1][j] + 1, // deletion
        dp[i][j - 1] + 1, // insertion
        dp[i - 1][j - 1] + cost // substitution
      );
      if (
        i > 1 &&
        j > 1 &&
        a[i - 1] === b[j - 2] &&
        a[i - 2] === b[j - 1]
      ) {
        best = Math.min(best, dp[i - 2][j - 2] + 1); // adjacent transposition
      }
      dp[i][j] = best;
    }
  }

  return dp[lenA][lenB];
}

function getEcosystemList(ecosystem, corpus) {
  if (!corpus) return [];
  if (Array.isArray(corpus)) return corpus;
  const list = corpus[ecosystem] || [];
  return Array.isArray(list) ? list : [];
}

export function isPopularPackage(name, ecosystem = 'npm', corpus = null) {
  const norm = normalizeName(name, ecosystem);
  if (!norm) return false;
  const list = getEcosystemList(ecosystem, corpus);
  for (let i = 0; i < list.length; i++) {
    if (normalizeName(list[i], ecosystem) === norm) {
      return true;
    }
  }
  return false;
}

/**
 * Checks if `name` is a likely typosquat of a popular package in `corpus`.
 * Returns the popular package name (and distance) if a match is found, or null if clean/popular.
 */
export function findTyposquatCandidate(name, ecosystem = 'npm', corpus = null) {
  const norm = normalizeName(name, ecosystem);
  if (!norm || norm.length < 3) return null;

  const list = getEcosystemList(ecosystem, corpus);
  if (list.length === 0) return null;

  // If the package itself is in the popular corpus, it is not a typosquat
  if (isPopularPackage(norm, ecosystem, corpus)) {
    return null;
  }

  const collapsedInput = norm.replace(/[-_.]/g, '');
  let bestTarget = null;
  let bestDistance = Infinity;

  for (let i = 0; i < list.length; i++) {
    const candidateRaw = list[i];
    const candidate = normalizeName(candidateRaw, ecosystem);
    if (!candidate || candidate === norm) continue;

    // 1. Delimiter confusion check (e.g. reactdom vs react-dom, python_dotenv vs python-dotenv)
    const collapsedCand = candidate.replace(/[-_.]/g, '');
    if (collapsedInput === collapsedCand && norm !== candidate) {
      return {
        target: candidateRaw,
        package: candidateRaw,
        distance: 1,
        reason: 'delimiter confusion',
      };
    }

    // 2. Damerau-Levenshtein distance threshold scaled by package length
    const maxAllowedDist = candidate.length >= 8 ? 2 : 1;
    if (Math.abs(norm.length - candidate.length) > maxAllowedDist) continue;

    const dist = damerauLevenshtein(norm, candidate);
    if (dist > 0 && dist <= maxAllowedDist && dist < bestDistance) {
      bestDistance = dist;
      bestTarget = candidateRaw;
    }
  }

  if (bestTarget) {
    return {
      target: bestTarget,
      package: bestTarget,
      distance: bestDistance,
      reason: 'typosquat similarity',
    };
  }

  return null;
}
