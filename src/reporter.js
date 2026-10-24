const RAW = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  bgRed: '\x1b[41m',
  bgGreen: '\x1b[42m',
  bgYellow: '\x1b[43m'
};

const isColorSupported = Boolean((process.stdout.isTTY || process.env.CI) && !process.env.NO_COLOR);
const c = isColorSupported
  ? RAW
  : Object.fromEntries(Object.keys(RAW).map(k => [k, '']));

export function printBanner() {
  console.log(`
${c.cyan}${c.bold}   ███████╗██╗      ██████╗ ██████╗       ██████╗ ███████╗██████╗ ███████╗
   ██╔════╝██║     ██╔═══██╗██╔══██╗      ██╔══██╗██╔════╝██╔══██╗██╔════╝
   ███████╗██║     ██║   ██║██████╔╝█████╗██║  ██║█████╗  ██████╔╝███████╗
   ╚════██║██║     ██║   ██║██╔═══╝ ╚════╝██║  ██║██╔══╝  ██╔═══╝ ╚════██║
   ███████║███████╗╚██████╔╝██║           ██████╔╝███████╗██║     ███████║
   ╚══════╝╚══════╝ ╚═════╝ ╚═╝           ╚═════╝ ╚══════╝╚═╝     ╚══════╝${c.reset}
   ${c.dim}AI Dependency Hallucination & Supply-Chain Sentinel • v1.4.0${c.reset}
`);
}

export function printResults(findings, stats) {
  console.log(`${c.bold}╭─────────────────────────────────────────────────────────────────────────────╮${c.reset}`);
  console.log(`${c.bold}│  SCAN RESULTS                                                               │${c.reset}`);
  console.log(`${c.bold}╰─────────────────────────────────────────────────────────────────────────────╯${c.reset}\n`);

  if (findings.length === 0) {
    console.log(`  ${c.green}${c.bold}✔ No foreign dependencies detected to verify.${c.reset}\n`);
    return;
  }

  const critical = findings.filter(f => f.risk === 'CRITICAL');
  const high = findings.filter(f => f.risk === 'HIGH');
  const clean = findings.filter(f => f.risk === 'CLEAN');
  const warn = findings.filter(f => f.risk === 'WARN');

  // Print Critical Hallucinations first
  if (critical.length > 0) {
    console.log(`  ${c.bgRed}${c.white}${c.bold} 🔴 CRITICAL: HALLUCINATED PACKAGES (DOES NOT EXIST) ${c.reset}`);
    console.log(`  ${c.red}These packages were referenced in code, but DO NOT exist on the registry.${c.reset}`);
    console.log(`  ${c.red}${c.bold}ATTACK HAZARD:${c.reset} ${c.dim}An attacker can claim these names and inject malware.${c.reset}\n`);

    for (const item of critical) {
      console.log(`    • ${c.bold}${c.red}${item.name}${c.reset} ${c.dim}[${item.ecosystem}]${c.reset}`);
      console.log(`      ${c.dim}Location:${c.reset} ${item.file}${item.line ? `:${item.line}` : ''}`);
      console.log(`      ${c.dim}Action:${c.reset}   ${c.yellow}Remove this import or register the package name immediately!${c.reset}\n`);
    }
  }

  // Print Suspicious / Brand new packages
  if (high.length > 0) {
    console.log(`  ${c.bgYellow}${c.white}${c.bold} 🟡 WARNING: SUSPICIOUS / BRAND NEW PACKAGES ${c.reset}`);
    console.log(`  ${c.yellow}Recently registered packages with low traction. Inspect before installing.${c.reset}\n`);

    for (const item of high) {
      console.log(`    • ${c.bold}${c.yellow}${item.name}${c.reset} ${c.dim}[${item.ecosystem}]${c.reset}`);
      console.log(`      ${c.dim}Location:${c.reset} ${item.file}${item.line ? `:${item.line}` : ''}`);
      console.log(`      ${c.dim}Detail:${c.reset}   ${item.message}\n`);
    }
  }

  // Print network / unresolved warnings so they are never silently swallowed
  if (warn.length > 0) {
    console.log(`  ${c.bgYellow}${c.white}${c.bold} ⚠ WARNINGS: UNRESOLVED / NETWORK ${c.reset}`);
    console.log(`  ${c.yellow}Could not be fully verified. Inspect before trusting the result.${c.reset}\n`);

    for (const item of warn) {
      console.log(`    • ${c.bold}${c.yellow}${item.name}${c.reset} ${c.dim}[${item.ecosystem}]${c.reset}`);
      console.log(`      ${c.dim}Location:${c.reset} ${item.file}${item.line ? `:${item.line}` : ''}`);
      console.log(`      ${c.dim}Detail:${c.reset}   ${item.message}\n`);
    }
  }

  // Summary box
  console.log(`${c.dim}───────────────────────────────────────────────────────────────────────────────${c.reset}`);
  console.log(`  ${c.bold}Total Inspected:${c.reset} ${stats.total}`);
  console.log(`  ${c.green}✔ Verified Legit:${c.reset} ${clean.length}`);
  console.log(`  ${c.yellow}⚠ Suspicious:${c.reset}     ${high.length}`);
  console.log(`  ${c.red}${c.bold}✖ Hallucinated:${c.reset}   ${critical.length}`);
  if (warn.length > 0) {
    console.log(`  ${c.dim}? Unknown/Network:${c.reset} ${warn.length}`);
  }
  console.log(`${c.dim}───────────────────────────────────────────────────────────────────────────────${c.reset}\n`);

  if (critical.length > 0) {
    console.log(`  ${c.bgRed}${c.white}${c.bold} ✖ SECURITY CHECK FAILED ${c.reset} ${c.red}Fix hallucinated packages before pushing!${c.reset}\n`);
  } else if (high.length > 0 || warn.length > 0) {
    const reasons = [];
    if (high.length > 0) reasons.push(`${high.length} suspicious`);
    if (warn.length > 0) reasons.push(`${warn.length} unresolved/network`);
    console.log(`  ${c.bgYellow}${c.white}${c.bold} ⚠ PASSED WITH WARNINGS ${c.reset} ${c.yellow}Review warnings (${reasons.join(', ')}). Rerun with --strict to enforce in CI.${c.reset}\n`);
  } else {
    console.log(`  ${c.bgGreen}${c.white}${c.bold} ✔ ALL DEPENDENCIES VERIFIED ${c.reset} ${c.green}Zero hallucinated packages detected.${c.reset}\n`);
  }
}
