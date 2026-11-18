// SHA-256 corpus integrity verification for slop-deps
// Protects against tampered, poisoned, or corrupted popularity datasets

import { promises as fs } from 'fs';
import path from 'path';
import { createHash } from 'crypto';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, '..');
const MANIFEST_PATH = path.join(ROOT_DIR, 'corpus', 'manifest.json');

export async function verifyCorpusIntegrity(customManifestPath = null) {
  const manifestFile = customManifestPath || MANIFEST_PATH;
  let manifestRaw;
  try {
    manifestRaw = await fs.readFile(manifestFile, 'utf-8');
  } catch (err) {
    const generatedExists = await fs.stat(path.join(__dirname, 'corpus.generated.js')).then(() => true).catch(() => false);
    if (generatedExists) {
      const error = new Error(`Corpus integrity verification failed: manifest file missing at ${manifestFile}`);
      error.code = 'ECORPUS_TAMPERED';
      throw error;
    }
    return { verified: true, files: [] };
  }

  let manifest;
  try {
    manifest = JSON.parse(manifestRaw);
  } catch (err) {
    const error = new Error(`Corpus integrity verification failed: malformed manifest at ${manifestFile}: ${err.message}`);
    error.code = 'ECORPUS_TAMPERED';
    throw error;
  }

  if (!manifest.files || typeof manifest.files !== 'object') {
    const error = new Error('Corpus integrity verification failed: invalid manifest structure');
    error.code = 'ECORPUS_TAMPERED';
    throw error;
  }

  const baseDir = customManifestPath
    ? (path.basename(path.dirname(manifestFile)) === 'corpus'
        ? path.dirname(path.dirname(manifestFile))
        : path.dirname(manifestFile))
    : ROOT_DIR;

  for (const [relPath, meta] of Object.entries(manifest.files)) {
    const absPath = path.resolve(baseDir, relPath);
    let fileData;
    try {
      fileData = await fs.readFile(absPath);
    } catch (err) {
      const error = new Error(`Corpus integrity verification failed: file '${relPath}' missing`);
      error.code = 'ECORPUS_TAMPERED';
      throw error;
    }

    const actualHash = createHash('sha256').update(fileData).digest('hex');
    if (actualHash !== meta.sha256) {
      const error = new Error(
        `Corpus integrity verification failed: SHA-256 mismatch for '${relPath}' (expected ${meta.sha256}, got ${actualHash}). Corpus may be corrupted or tampered.`
      );
      error.code = 'ECORPUS_TAMPERED';
      throw error;
    }
  }

  return { verified: true, version: manifest.version, files: Object.keys(manifest.files) };
}
