/**
 * scripts/generate-checksums.js
 * Generates standard SHA256SUMS.txt for release assets
 * using zero runtime dependencies (Node stdlib only).
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

export function computeFileSHA256(filePath) {
  const content = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(content).digest('hex');
}

export function generateChecksums(targetDir, outputFile) {
  if (!fs.existsSync(targetDir)) {
    throw new Error(`Target directory does not exist: ${targetDir}`);
  }

  const entries = fs.readdirSync(targetDir, { withFileTypes: true });
  const lines = [];

  for (const entry of entries) {
    if (entry.isFile() && !entry.name.endsWith('.txt') && !entry.name.endsWith('.sha256')) {
      const fullPath = path.join(targetDir, entry.name);
      const hash = computeFileSHA256(fullPath);
      lines.push(`${hash}  ${entry.name}`);
    }
  }

  const outputContent = lines.join('\n') + (lines.length > 0 ? '\n' : '');
  if (outputFile) {
    fs.writeFileSync(outputFile, outputContent, 'utf-8');
    console.log(`[checksums] Generated SHA256SUMS with ${lines.length} entries at: ${outputFile}`);
  }
  return outputContent;
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  const targetDir = process.argv[2] ? path.resolve(process.argv[2]) : path.join(rootDir, 'dist');
  const outputFile = process.argv[3] ? path.resolve(process.argv[3]) : path.join(targetDir, 'SHA256SUMS.txt');
  generateChecksums(targetDir, outputFile);
}
