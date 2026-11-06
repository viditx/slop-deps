// Persistent verification cache — a single JSON file in the OS temp dir.
// Exists results live 24h; HALLUCINATED (404) results live only 6h because a
// free name can be registered as a trap at any moment. Cache failures never
// break scans. Zero dependencies.

import os from 'os';
import path from 'path';
import { promises as fs } from 'fs';

const CACHE_DIR = process.env.XDG_CACHE_HOME
  || process.env.LOCALAPPDATA
  || path.join(os.homedir(), '.cache');
const CACHE_FILE = path.join(CACHE_DIR, 'slop-deps', 'cache.json');
const TTL = {
  EXISTS_MS: 24 * 60 * 60 * 1000,
  HALLUCINATED_MS: 6 * 60 * 60 * 1000
};

let store = null;
let dirty = false;
let loader = null;

function ttlFor(entry) {
  if (entry && entry.r && entry.r.risk === 'CRITICAL') return TTL.HALLUCINATED_MS;
  return TTL.EXISTS_MS;
}

async function load() {
  if (store) return store;
  if (loader) return loader;
  loader = (async () => {
    try {
      const stat = await fs.lstat(CACHE_FILE);
      if (stat.isSymbolicLink()) throw new Error('cache path is a symbolic link');
      const raw = await fs.readFile(CACHE_FILE, 'utf-8');
      const parsed = JSON.parse(raw);
      store = Object.create(null);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        for (const k of Object.keys(parsed)) {
          if (k !== '__proto__' && k !== 'constructor' && k !== 'prototype') {
            store[k] = parsed[k];
          }
        }
      }
    } catch {
      store = Object.create(null);
    }
    return store;
  })();
  return loader;
}

export async function cacheGet(key, now = Date.now()) {
  if (!key || key === '__proto__' || key === 'constructor' || key === 'prototype') return null;
  const s = await load();
  const entry = s[key];
  if (!entry) return null;
  if (now - entry.t > ttlFor(entry)) {
    delete s[key];
    return null;
  }
  return entry.r;
}

export async function cacheSet(key, result, now = Date.now()) {
  if (!key || key === '__proto__' || key === 'constructor' || key === 'prototype') return;
  if (!result || result.status === 'NETWORK_ERROR' || result.status === 'UNKNOWN') return;
  const s = await load();
  s[key] = { t: now, r: result };
  dirty = true;
}

export async function cacheFlush() {
  if (!dirty || !store) return;
  dirty = false;
  try {
    await fs.mkdir(path.dirname(CACHE_FILE), { recursive: true });
    try {
      const stat = await fs.lstat(CACHE_FILE);
      if (stat.isSymbolicLink()) throw new Error('cache path is a symbolic link');
    } catch (err) {
      if (err.code !== 'ENOENT') throw err;
    }
    await fs.writeFile(CACHE_FILE, JSON.stringify(store), { encoding: 'utf-8', mode: 0o600 });
  } catch {
    // read-only tmpdir or race with another process — in-memory cache still works
  }
}

export async function cacheClear() {
  store = {};
  dirty = false;
  try {
    await fs.unlink(CACHE_FILE);
    return true;
  } catch {
    return false;
  }
}

export function cachePath() {
  return CACHE_FILE;
}
