#!/usr/bin/env node

import path from 'path';
import { scanDirectory } from '../src/index.js';
import { printBanner, printResults } from '../src/reporter.js';

const args = process.argv.slice(2);

if (args.includes('--help') || args.includes('-h')) {
  console.log(`
slop-deps — AI Dependency Hallucination & Supply-Chain Sentinel

USAGE:
  npx slop-deps [options]

OPTIONS:
  -d, --dir <path>    Specify directory to scan (default: current working directory)
  --json              Output findings as raw JSON (ideal for CI/CD pipelines)
  --strict            Exit with code 2 if suspicious packages, network errors, or warnings occur
  -v, --version       Display version number
  -h, --help          Display this help message

EXIT CODES:
  0   All dependencies verified or clean
  1   Critical hallucinated packages detected (fails CI/CD or pre-commit)
  2   Target directory not found or network verification incomplete
`);
  process.exit(0);
}

if (args.includes('--version') || args.includes('-v')) {
  console.log('1.0.0');
  process.exit(0);
}

const isJson = args.includes('--json');
const isStrict = args.includes('--strict');
let targetDir = process.cwd();

for (let i = 0; i < args.length; i++) {
  const arg = args[i];
  if (arg === '--dir' || arg === '-d') {
    if (args[i + 1]) targetDir = path.resolve(process.cwd(), args[++i]);
  } else if (arg.startsWith('--dir=')) {
    targetDir = path.resolve(process.cwd(), arg.slice(6));
  } else if (arg.startsWith('-d=')) {
    targetDir = path.resolve(process.cwd(), arg.slice(3));
  }
}

async function run() {
  if (!isJson) {
    printBanner();
    process.stdout.write(`  Scanning directory: ${targetDir} ...`);
  }

  let result;
  try {
    result = await scanDirectory(targetDir);
  } catch (err) {
    if (!isJson) {
      process.stdout.write('\x1b[2K\r');
      console.error(`\x1b[31m\x1b[1m✖ ERROR:\x1b[0m ${err.message}\n`);
    } else {
      console.error(JSON.stringify({ error: err.message, code: err.code }));
    }
    process.exit(2);
  }

  const { findings, stats } = result;

  if (isJson) {
    console.log(JSON.stringify({ findings, stats }, null, 2));
  } else {
    // Clear scanning status line cleanly
    process.stdout.write('\x1b[2K\r');
    printResults(findings, stats);
  }

  if (stats.critical > 0) {
    process.exit(1);
  } else if (isStrict && (stats.suspicious > 0 || stats.warn > 0)) {
    process.exit(2);
  } else {
    process.exit(0);
  }
}

run().catch(err => {
  console.error('\x1b[31mFatal error during scan:\x1b[0m', err.message);
  process.exit(2);
});
