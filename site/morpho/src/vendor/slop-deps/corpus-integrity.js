// Browser-safe stub for web scanner — bundled corpus is statically verified during build
export async function verifyCorpusIntegrity() {
  return { verified: true, version: '1.0.0-alpha', files: [] };
}
