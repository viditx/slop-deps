import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const installerPath = path.resolve(__dirname, '../public/slopdeps-installer.exe');

if (!fs.existsSync(installerPath)) {
  console.error('❌ Build Guard Failed: public/slopdeps-installer.exe does not exist!');
  process.exit(1);
}

const stats = fs.statSync(installerPath);
if (stats.size < 1024 * 1024) {
  console.error(`❌ Build Guard Failed: public/slopdeps-installer.exe is too small (${stats.size} bytes < 1MB)!`);
  process.exit(1);
}

console.log(`✓ Build Guard Passed: public/slopdeps-installer.exe is valid (${(stats.size / (1024 * 1024)).toFixed(2)} MB)`);
