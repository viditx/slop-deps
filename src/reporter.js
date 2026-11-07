const RAW = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
};

const isColorSupported = Boolean((process.stdout.isTTY || process.env.CI) && !process.env.NO_COLOR);
const c = isColorSupported
  ? RAW
  : Object.fromEntries(Object.keys(RAW).map(k => [k, '']));

export function printBanner() {
  console.log(`${c.dim}slop-deps v1.0.0-alpha${c.reset}\n`);
}

export function printResults(findings, stats) {
  if (findings.length === 0) {
    console.log(`  ${c.green}✔${c.reset} No foreign packages found to verify.\n`);
    return;
  }

  const critical = findings.filter(f => f.risk === 'CRITICAL');
  const high = findings.filter(f => f.risk === 'HIGH');
  const warn = findings.filter(f => f.risk === 'WARN');
  const clean = findings.filter(f => f.risk === 'CLEAN');

  const issues = [...critical, ...high, ...warn];

  if (issues.length > 0) {
    for (const item of issues) {
      const loc = `${item.file}${item.line ? `:${item.line}` : ''}`;
      const prefix = item.risk === 'CRITICAL'
        ? `${c.red}error${c.reset}`
        : `${c.yellow}warning${c.reset}`;

      console.log(`  ${c.bold}${loc}${c.reset}`);

      if (item.risk === 'CRITICAL') {
        console.log(`    ${prefix}: package '${c.bold}${item.name}${c.reset}' does not exist on ${item.ecosystem}\n`);
      } else {
        const detail = item.message || (item.suggestion ? `looks like typosquat of '${item.suggestion}'` : 'unverified package');
        console.log(`    ${prefix}: ${item.name} (${item.ecosystem}) - ${detail}\n`);
      }
    }
  }

  // Summary line
  const parts = [];
  if (critical.length > 0) {
    parts.push(`${c.red}${critical.length} error${critical.length > 1 ? 's' : ''}${c.reset}`);
  }
  if (high.length + warn.length > 0) {
    const totalWarn = high.length + warn.length;
    parts.push(`${c.yellow}${totalWarn} warning${totalWarn > 1 ? 's' : ''}${c.reset}`);
  }

  if (parts.length > 0) {
    console.log(`  ${parts.join(', ')} (${stats.total} packages checked)\n`);
  } else {
    console.log(`  ${c.green}✔${c.reset} All ${stats.total} packages verified on registry.\n`);
  }
}
