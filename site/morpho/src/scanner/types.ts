export type Verdict = 'HALLUCINATED' | 'SUSPICIOUS' | 'VERIFIED' | 'UNCHECKED';

export interface PackageResult {
  name: string;
  version: string;
  ecosystem: 'npm' | 'pypi' | 'crates';
  verdict: Verdict;
  reason?: string;
  suggestion?: string;
}

export interface FileScanResult {
  fileName: string;
  ecosystem: string;
  packages: PackageResult[];
  counts: Record<Verdict, number>;
  durationMs: number;
  error?: 'unsupported' | 'invalid' | 'empty' | 'too_large';
}
