// SARIF 2.1.0 output for GitHub code scanning integration.
// Only problem findings (CRITICAL/HIGH/WARN) become results; CLEAN packages are omitted.

const RISK_TO_LEVEL = {
  CRITICAL: 'error',
  HIGH: 'warning',
  WARN: 'note'
};

const RULES = [
  { id: 'SD001', short: 'hallucinatedPackage', level: 'error', text: 'Referenced package does not exist on the registry. An attacker can register it and ship malware.' },
  { id: 'SD002', short: 'typosquatRisk', level: 'warning', text: 'Package name closely imitates a hugely popular package, or shows other supply-chain risk signals.' },
  { id: 'SD003', short: 'unresolved', level: 'note', text: 'Package could not be verified (network error or invalid specifier).' }
];

function ruleFor(finding) {
  if (finding.risk === 'CRITICAL') return RULES[0];
  if (finding.risk === 'HIGH') return RULES[1];
  return RULES[2];
}

export function toSarif(findings) {
  const problems = findings.filter(f => RISK_TO_LEVEL[f.risk]);
  const usedRules = new Map();
  for (const finding of problems) {
    usedRules.set(ruleFor(finding).id, true);
  }

  const results = problems.map(finding => {
    const rule = ruleFor(finding);
    const location = finding.file
      ? [{
          physicalLocation: {
            artifactLocation: { uri: finding.file.replace(/\\/g, '/') },
            ...(finding.line ? { region: { startLine: finding.line } } : {})
          }
        }]
      : [];

    return {
      ruleId: rule.id,
      level: RISK_TO_LEVEL[finding.risk],
      message: { text: `[${finding.ecosystem}] ${finding.name}: ${finding.message}` },
      locations: location,
      properties: {
        name: finding.name,
        ecosystem: finding.ecosystem,
        risk: finding.risk,
        status: finding.status || ''
      }
    };
  });

  return {
    $schema: 'https://raw.githubusercontent.com/oasis-tcs/sarif-spec/master/Schemata/sarif-schema-2.1.0.json',
    version: '2.1.0',
    runs: [
      {
        tool: {
          driver: {
            name: 'slop-deps',
            informationUri: 'https://github.com/viditx/slop-deps',
            version: '1.4.0',
            rules: RULES.filter(r => usedRules.has(r.id)).map(r => ({
              id: r.id,
              shortDescription: { text: r.short },
              defaultConfiguration: { level: r.level },
              fullDescription: { text: r.text }
            }))
          }
        },
        results
      }
    ]
  };
}
