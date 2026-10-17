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
  -v, --version       Display version number
  -h, --help          Display this help message

EXIT CODES:
  0   All dependencies verified or clean
  1   Critical hallucinated packages detected (fails CI/CD or pre-commit)
`);
  process.exit(0);
}

if (args.includes('--version') || args.includes('-v')) {
  console.log('1.0.0');
  process.exit(0);
}

const isJson = args.includes('--json');
let targetDir = process.cwd();

const dirIdx = args.findIndex(a => a === '--dir' || a === '-d');
if (dirIdx !== -1 && args[dirIdx + 1]) {
  targetDir = path.resolve(process.cwd(), args[dirIdx + 1]);
}

async function run() {
  if (!isJson) {
    printBanner();
    process.stdout.write(`  Scanning directory: ${targetDir} ...\r`);
  }

  const { findings, stats } = await scanDirectory(targetDir);

  if (isJson) {
    console.log(JSON.stringify({ findings, stats }, null, 2));
  } else {
    printResults(findings, stats);
  }

  if (stats.critical > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

run().catch(err => {
  console.error('\x1b[31mFatal error during scan:\x1b[0m', err.message);
  process.exit(1);
});
