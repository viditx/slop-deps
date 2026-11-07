import type { FileScanResult } from '../scanner/types';

export const TIMEOUT_ERROR_MESSAGE =
  'Scan exceeded the 8s browser cap (network or registry slow). Try fewer files at once, or run the CLI.';

export function formatHeadline(result: FileScanResult): string {
  if (result.error === 'too_large') return 'FILE TOO LARGE (2 MB MAX)';
  if (result.error === 'timeout') return 'SCAN TIMEOUT';
  if (result.error === 'unsupported') return 'UNSUPPORTED FILE';
  if (result.error === 'invalid') return 'INVALID MANIFEST';
  if (result.error === 'empty') return 'EMPTY MANIFEST';

  const flagged =
    (result.counts.HALLUCINATED || 0) + (result.counts.SUSPICIOUS || 0);
  const unchecked = result.counts.UNCHECKED || 0;

  if (flagged > 0) {
    return `${flagged} FLAGGED`;
  }
  if (unchecked > 0) {
    return `NO FLAGGED · ${unchecked} UNCHECKED`;
  }
  if (!result.packages || result.packages.length === 0) {
    return 'NO EXTERNAL PACKAGES';
  }
  return 'NO FLAGGED PACKAGES';
}
