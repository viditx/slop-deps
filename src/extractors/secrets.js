// Zero-dependency leaked-credential scanner.
// Prefix rules catch known provider token formats (OpenAI, Anthropic, GitHub,
// AWS, Stripe); context rules catch generic key material via Shannon entropy.
// Raw secrets never leave this module — findings carry a 4-char masked preview.

const PREFIX_RULES = [
  {
    id: 'anthropic-api-key',
    label: 'Anthropic API key',
    re: /\bsk-ant-[A-Za-z0-9_-]{20,}\b/g
  },
  {
    id: 'openai-api-key',
    label: 'OpenAI API key',
    // (?!ant-) keeps sk-ant- keys attributed to the Anthropic rule
    re: /\bsk-(?!ant-)[A-Za-z0-9_-]{20,}\b/g
  },
  {
    id: 'github-classic-pat',
    label: 'GitHub personal access token',
    re: /\bgh[pousr]_[A-Za-z0-9]{30,}\b/g
  },
  {
    id: 'github-fine-grained-pat',
    label: 'GitHub fine-grained personal access token',
    re: /\bgithub_pat_[A-Za-z0-9_]{40,}\b/g
  },
  {
    id: 'aws-access-key-id',
    label: 'AWS access key ID',
    re: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g
  },
  {
    id: 'stripe-secret-key',
    label: 'Stripe secret key',
    re: /\b(?:sk|rk)_(?:test|live)_[A-Za-z0-9]{16,}\b/g
  }
];

const CONTEXT_RULES = [
  {
    id: 'aws-secret-access-key',
    label: 'AWS secret access key',
    re: /\baws[_-]?secret[_-]?access[_-]?key\s*[:=]\s*['"]?([A-Za-z0-9/+]{35,50})['"]?/gi
  },
  {
    id: 'generic-secret',
    label: 'high-entropy credential',
    re: /\b[A-Za-z0-9_]*(?:api[_-]?key|apikey|secret|token|password|passwd|auth)[A-Za-z0-9_]*\s*[:=]\s*['"]([A-Za-z0-9_+/=!@#$%^&*.~-]{20,})['"]/gi
  },
  {
    id: 'generic-env-secret',
    label: 'high-entropy credential',
    re: /\b([A-Z][A-Z0-9_]{2,}(?:KEY|SECRET|TOKEN|PASSWORD|PASSWD|AUTH)[A-Z0-9_]*)\s*=\s*([A-Za-z0-9_+/=-]{20,})(?=\s|$)/g
  }
];

const PLACEHOLDER_HINTS = [
  'your', 'placeholder', 'changeme', 'change-me', 'example', 'dummy',
  'todo', 'fixme', 'redacted', 'sample-key', 'xxxx'
];

const ALL_X_RE = /^[x*.\-_]{8,}$/;

function shannonEntropy(str) {
  const freq = new Map();
  for (const ch of str) {
    freq.set(ch, (freq.get(ch) || 0) + 1);
  }
  let bits = 0;
  for (const count of freq.values()) {
    const p = count / str.length;
    bits -= p * Math.log2(p);
  }
  return bits;
}

function isPlausibleSecret(token, minEntropy) {
  if (!token || token.length < 16) return false;
  const lower = token.toLowerCase();
  if (PLACEHOLDER_HINTS.some(hint => lower.includes(hint))) return false;
  if (ALL_X_RE.test(token)) return false;
  return shannonEntropy(token) >= minEntropy;
}

function maskToken(token) {
  return token.length <= 8 ? token.slice(0, 2) + '…' : token.slice(0, 4) + '…';
}

function buildFinding(id, label, token, filePath, lineNo, contextName) {
  return {
    name: id,
    type: 'secret',
    ecosystem: 'secrets',
    file: filePath,
    line: lineNo,
    raw: maskToken(token),
    status: 'LEAK',
    risk: 'CRITICAL',
    exists: null,
    message: contextName
      ? `Possible ${label} assigned to '${contextName}'. Rotate this credential immediately.`
      : `Possible ${label} committed to source. Rotate this credential immediately.`
  };
}

export function scanSecrets(sourceCode, filePath = '') {
  const findings = [];
  const lines = sourceCode.split(/\r?\n/);

  for (let li = 0; li < lines.length; li++) {
    const text = lines[li];
    if (!text) continue;
    const lineNo = li + 1;

    let specificFound = false;
    for (const rule of PREFIX_RULES) {
      rule.re.lastIndex = 0;
      let m;
      while ((m = rule.re.exec(text)) !== null) {
        if (!isPlausibleSecret(m[0], 2.8)) continue;
        specificFound = true;
        findings.push(buildFinding(rule.id, rule.label, m[0], filePath, lineNo, null));
      }
    }
    if (specificFound) continue;

    let contextFound = false;
    for (const rule of CONTEXT_RULES) {
      if (contextFound) break;
      rule.re.lastIndex = 0;
      let m;
      while ((m = rule.re.exec(text)) !== null) {
        const token = m[2] ?? m[1] ?? m[0];
        if (!isPlausibleSecret(token, 3.5)) continue;
        contextFound = true;
        findings.push(buildFinding(rule.id, rule.label, token, filePath, lineNo, rule.id === 'generic-env-secret' ? m[1] : null));
        break;
      }
    }
  }

  return findings;
}
