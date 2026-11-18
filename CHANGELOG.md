# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0-alpha] - 2026-11-18

### Security & Correctness (P0)
- **Fail-Closed Registry Probes (P0-1)**:
  - Introduced tri-state probe status (`exists` | `not-exists` | `unknown`).
  - Network timeouts, rate limits (HTTP 429), 5xx server errors, connection aborts, and DNS NXDOMAIN are classified as `UNKNOWN` instead of false positives or silent passes.
  - Enforced strict fail-closed exit: under `--strict`, any `UNKNOWN` probe triggers exit code `2`.
- **Lexer Blindspot Hardening (P0-2)**:
  - Added detection and emission of `UNKNOWN` findings with accurate `file:line` for dynamic/unresolvable patterns:
    - JS/TS: `require(<non-literal>)`, `import(<expression>)`, template string interpolation, string concatenation, and dynamic re-exports (`export * from <dynamic>`).
    - Python: non-literal `__import__(<non-literal>)`, `importlib.import_module(...)`, and `sys.modules[...]`.
    - Rust: `#[path = ...]` attributes and macro-generated module calls.
  - Under `--strict`, each dynamic import pattern exits code `2`.
- **`--fix` Safety Re-validation & Atomicity (P0-3)**:
  - Re-routes all AI-suggested replacement specifiers through the full detection and registry verification pipeline before write.
  - Rejects any replacement that does not resolve to confirmed `exists`.
  - Enforced atomic file write via temporary file creation and atomic rename, with automatic rollback to original contents on write errors.
  - Guarded `.bak` backup files against path traversal and symlink/junction escape attacks.
- **Secret Redaction across Output Paths (P0-4)**:
  - Redacts sensitive credentials, API keys, private tokens (npm tokens, GitHub PATs, GitLab tokens, PyPI tokens, AWS access keys, Slack webhooks, OpenAI/Anthropic keys, HTTP Basic auth) across all stdout, stderr, JSON reports, SARIF output, and `--fix` diffs.

### Reliability & Quality (P1)
- **Hardened HTTP Client (P1-1)**:
  - Replaced unthrottled fetches with bounded concurrency pool (`<= 8` concurrent requests).
  - Implemented exponential backoff with jitter on HTTP 429 and 5xx responses, respecting `Retry-After` headers.
  - Enforced strict connection and request timeouts with an immutable `User-Agent: slop-deps/<version>` across all probes.
- **Deterministic Output (P1-2)**:
  - Enforced stable lexical sorting of all findings by `(file, line, package, ecosystem)` ensuring byte-identical outputs for CI diff stability.
- **Corpus Integrity Verification (P1-3)**:
  - Added SHA-256 integrity digest manifest (`corpus/manifest.json`) and version tracking (`corpus/version`) for bundled offline package popularity corpus.
  - Verifies corpus digest on startup and rejects tampered datasets with `ECORPUS_TAMPERED`.
- **Manifest Parser Robustness (P1-4)**:
  - Hardened manifest extractors against UTF-8 BOM (`\uFEFF`), CRLF line terminators, multiline strings, duplicate keys, and unclosed arrays.
  - Catches malformed manifests gracefully, emitting `UNKNOWN` syntax findings with accurate `file:line` without unhandled exceptions.
- **Zero-Dependency Invariant in CI (P1-5)**:
  - Added automated CI check verifying `dependencies` and `optionalDependencies` in `package.json` remain strictly empty.
- **Adversarial Extractor Fuzzing (P1-6)**:
  - Added adversarial property-based fuzz tests verifying all extractors handle null bytes, nested expressions, oversized tokens, and malformed syntax without crashes.

### Hardening & Polish (P2)
- **GitHub Action Hardening (P2-1)**:
  - Pinned all workflow GitHub Actions to immutable full commit SHAs with semantic tag comments.
  - Configured least-privilege `permissions: contents: read` across workflows.
- **Release Automation & SBOM (P2-2)**:
  - Created `.github/workflows/release.yml` publishing standalone Windows installer (`slopdeps-installer.exe`), SHA-256 checksums (`SHA256SUMS.txt`), and SPDX-2.3 compliant Software Bill of Materials (`sbom.spdx.json`).
  - Added zero-dependency generation scripts `scripts/generate-sbom.js` and `scripts/generate-checksums.js`.
  - Documented Windows binary code-signing status and cryptographic verification instructions in `README.md`.
- **Documentation Accuracy (P2-3)**:
  - Updated `PRIVACY.md` with an exhaustive audit table mapping every outbound host, protocol, port, payload, and purpose against source code.
- **Exit Code Contract Verification (P2-4)**:
  - Documented strict tri-state exit code contract (`0`: clean, `1`: findings, `2`: strict failure / tool error) in `README.md`.
  - Codified end-to-end integration tests in `test/run-tests.js` (Test 96) verifying each exit code condition.
