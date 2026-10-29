#!/usr/bin/env node

import path from 'path';
import { spawn } from 'child_process';
import { scanDirectory, scanStagedFiles } from '../src/index.js';
import { printBanner, printResults } from '../src/reporter.js';
import { toSarif } from '../src/sarif.js';
import { startDashboardServer } from '../src/server.js';
import { updateCorpus } from '../src/update-corpus.js';

const VERSION = '1.4.0';

const FIX_SYSTEM = `You fix broken package imports in source code. The scanner found imports referencing packages that do not exist on the registry (AI hallucinations) or that typosquat popular packages. For each finding, return the corrected import line: keep the language, style and named bindings identical, only change the package specifier to the real package the code clearly intended. If no real package plausibly matches, set "new" to null. Respond ONLY with a JSON array, no prose, no code fences.`;

const args = process.argv.slice(2);

if (args.includes('--help') || args.includes('-h')) {
  console.log(`
slop-deps — AI Dependency Hallucination & Supply-Chain Sentinel

USAGE:
  npx slop-deps [options]

OPTIONS:
  -d, --dir <path>    Specify directory to scan (default: current working directory)
  --staged            Scan only files staged in git (pre-commit mode)
  --offline           Privacy mode — bundled corpus + local cache only, zero network
  --private           Alias for --offline
  --trust-config      Load repository .slopdepsrc.json configuration
  --clear-cache       Wipe the local verdict cache and exit
  --update-corpus     Refresh the auto-generated typosquat corpus from live registries
  --ui [port]         Launch the local dashboard UI (binds 127.0.0.1 only)
  --json              Output findings as raw JSON (ideal for CI/CD pipelines)
  --sarif             Output SARIF 2.1.0 for GitHub code scanning
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
  console.log(VERSION);
  process.exit(0);
}

const isJson = args.includes('--json');
const isSarif = args.includes('--sarif');
const isStrict = args.includes('--strict');
const isStaged = args.includes('--staged');
const isOffline = args.includes('--offline') || args.includes('--private');
const isClearCache = args.includes('--clear-cache');
const isUpdateCorpus = args.includes('--update-corpus');
const isFix = args.includes('--fix');
const uiIndex = args.findIndex(a => a === '--ui');
let targetDir = process.cwd();

for (let i = 0; i < args.length; i++) {
  const arg = args[i];
  if (arg === '--dir' || arg === '-d') {
    if (args[i + 1] && !args[i + 1].startsWith('-')) {
      targetDir = path.resolve(process.cwd(), args[++i]);
    } else {
      console.error(`\x1b[31m✖ ERROR:\x1b[0m Option '${arg}' requires a directory path.\n`);
      process.exit(2);
    }
  } else if (arg.startsWith('--dir=')) {
    targetDir = path.resolve(process.cwd(), arg.slice(6));
  } else if (arg.startsWith('-d=')) {
    targetDir = path.resolve(process.cwd(), arg.slice(3));
  } else if (['--json', '--strict', '--sarif', '--staged', '--offline', '--private', '--trust-config', '--clear-cache', '--update-corpus', '--fix', '--ui'].includes(arg)) {
    // Valid flags
  } else if (!arg.startsWith('-')) {
    targetDir = path.resolve(process.cwd(), arg);
  } else if (arg.startsWith('-')) {
    console.error(`\x1b[31m✖ ERROR:\x1b[0m Unrecognized option: '${arg}'. Run 'slop-deps --help' for usage.\n`);
    process.exit(2);
  }
}

async function run() {
  if (isClearCache) {
    const { cacheClear, cachePath } = await import('../src/registries/cache.js');
    const wiped = await cacheClear();
    console.log(wiped ? `  \x1b[32m✔\x1b[0m Cache wiped: ${cachePath()}\n` : `  \x1b[33m•\x1b[0m No cache file present at ${cachePath()}\n`);
    process.exit(0);
  }

  if (isUpdateCorpus) {
    printBanner();
    console.log('  Refreshing typosquat corpus from live registries...');
    const result = await updateCorpus();
    console.log(`  \x1b[32m✔\x1b[0m Corpus regenerated: ${result.npm} npm + ${result.pypi} pypi names -> ${path.basename(result.file)}\n`);
    process.exit(0);
  }

  if (uiIndex !== -1) {
    const portArg = args[uiIndex + 1];
    const port = portArg && /^\d+$/.test(portArg) ? parseInt(portArg, 10) : 0;
    const dashboard = await startDashboardServer({ port, rootDir: targetDir });
    printBanner();
    console.log(`  Dashboard live at: \x1b[36m\x1b[1m${dashboard.url}\x1b[0m  (Ctrl+C to stop)`);
    const opener = process.platform === 'win32' ? 'cmd' : process.platform === 'darwin' ? 'open' : 'xdg-open';
    const openerArgs = process.platform === 'win32' ? ['/c', 'start', '', dashboard.url] : [dashboard.url];
    try {
      spawn(opener, openerArgs, { stdio: 'ignore', detached: true, windowsHide: true }).unref();
    } catch {}
    return;
  }

  if (!isJson && !isSarif) {
    printBanner();
    process.stdout.write(`  Scanning ${isStaged ? 'staged files' : 'directory'}: ${targetDir} ...`);
  }

  let result;
  try {
    result = isStaged
      ? await scanStagedFiles(targetDir, { offline: isOffline, allowConfig: args.includes('--trust-config') })
      : await scanDirectory(targetDir, { offline: isOffline, allowConfig: args.includes('--trust-config') });
  } catch (err) {
    if (!isJson && !isSarif) {
      process.stdout.write('\x1b[2K\r');
      console.error(`\x1b[31m\x1b[1m✖ ERROR:\x1b[0m ${err.message}\n`);
    } else {
      console.error(JSON.stringify({ error: err.message, code: err.code }));
    }
    process.exit(2);
  }

  const { findings, stats } = result;

  if (isSarif) {
    console.log(JSON.stringify(toSarif(findings), null, 2));
  } else if (isJson) {
    console.log(JSON.stringify({ findings, stats, ...(result.staged ? { staged: true, stagedFileCount: result.stagedFileCount } : {}) }, null, 2));
  } else {
    // Clear scanning status line cleanly
    process.stdout.write('\x1b[2K\r');
    printResults(findings, stats);
  }

  if (isFix && !isSarif && !isJson) {
    const { getAiConfig, aiChat } = await import('../src/ai.js');
    const { buildUserPrompt, parseFixes, applyFixes } = await import('../src/fixer.js');
    const ai = getAiConfig();
    if (!ai) {
      console.error(`\x1b[31m✖ --fix needs a BYOK key.\x1b[0m Set one of:
  SLOP_AI_KEY (or OPENAI_API_KEY / ANTHROPIC_API_KEY)
Optional: SLOP_AI_PROVIDER=openai|anthropic, SLOP_AI_MODEL, SLOP_AI_BASE_URL
Tip: point SLOP_AI_BASE_URL at http://127.0.0.1:11434/v1 (Ollama) to keep fixes fully local.\n`);
      process.exit(2);
    }
    const fixable = findings.filter(f => (f.risk === 'CRITICAL' || f.risk === 'HIGH') && f.file && f.raw);
    if (fixable.length === 0) {
      console.log('  \x1b[32m✔\x1b[0m Nothing to fix — no critical/suspicious import findings.\n');
      process.exit(stats.critical > 0 ? 1 : 0);
    }
    console.log(`  AI fix via \x1b[36m${ai.baseUrl}\x1b[0m (model: ${ai.model})${ai.local ? ' \x1b[32m[local endpoint]\x1b[0m' : ''}`);
    console.log(`  \x1b[33mPrivacy:\x1b[0m sending ${fixable.length} flagged import line(s) to the provider you configured.\n`);
    let fixes;
    try {
      const reply = await aiChat(ai, FIX_SYSTEM, buildUserPrompt(targetDir, fixable));
      fixes = parseFixes(reply);
    } catch (err) {
      console.error(`\x1b[31m✖ AI fix failed:\x1b[0m ${err.message}\n`);
      process.exit(2);
    }
    const applied = await applyFixes(targetDir, fixes, { findings: fixable });
    let changed = 0;
    for (const r of applied.filter(x => x.applied)) {
      changed++;
      console.log(`  \x1b[32m✔\x1b[0m ${r.file}:${r.line}`);
      console.log(`    \x1b[31m- ${r.before.trim()}\x1b[0m`);
      console.log(`    \x1b[32m+ ${r.after.trim()}\x1b[0m`);
    }
    const skipped = applied.filter(x => !x.applied).length;
    if (changed > 0) console.log(`\n  ${changed} line(s) fixed. Backups: *.slop-deps.bak`);
    if (skipped > 0) console.log(`  ${skipped} finding(s) left untouched (no safe suggestion).`);
    console.log('');
    process.exit(0);
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
