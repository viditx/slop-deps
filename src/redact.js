// Secrets and token redaction module for slop-deps
// Ensures no API tokens, credentials, or private keys leak into stdout, reports, or diffs

export function redactSecrets(val) {
  if (typeof val === 'string') {
    return val
      // URL basic auth (e.g. https://user:secret@domain)
      .replace(/(https?:\/\/)([^:\s\/]+):([^@\s\/]+)@/g, '$1$2:[REDACTED]@')
      // npm authToken in .npmrc or urls
      .replace(/(_authToken\s*=\s*)([^\s\n]+)/g, '$1[REDACTED]')
      // npm tokens: npm_...
      .replace(/\bnpm_[A-Za-z0-9_]{30,}\b/g, '[REDACTED_TOKEN]')
      // GitHub tokens: ghp_, gho_, ghu_, ghs_, ghr_, github_pat_
      .replace(/\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{20,})\b/g, '[REDACTED_TOKEN]')
      // GitLab tokens: glpat-
      .replace(/\bglpat-[A-Za-z0-9_\-]{20,}\b/g, '[REDACTED_TOKEN]')
      // Slack tokens: xox[baprs]-
      .replace(/\bxox[baprs]-[A-Za-z0-9_\-]{20,}\b/g, '[REDACTED_TOKEN]')
      // OpenAI / AI keys: sk-...
      .replace(/\bsk-(?:ant-)?[A-Za-z0-9_\-]{20,}\b/g, '[REDACTED_KEY]')
      // PyPI tokens: pypi-
      .replace(/\bpypi-[A-Za-z0-9_\-]{30,}\b/g, '[REDACTED_TOKEN]')
      // AWS Access Key ID
      .replace(/\bAKIA[0-9A-Z]{16}\b/g, '[REDACTED_AWS_KEY]')
      // Bearer / Basic auth header values
      .replace(/\b(Bearer\s+)[A-Za-z0-9_\-./+=]{20,}\b/gi, '$1[REDACTED]')
      .replace(/\b(Basic\s+)[A-Za-z0-9+/=]{20,}\b/gi, '$1[REDACTED]');
  }
  if (Array.isArray(val)) {
    return val.map(item => redactSecrets(item));
  }
  if (val !== null && typeof val === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(val)) {
      out[k] = redactSecrets(v);
    }
    return out;
  }
  return val;
}
