# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.0.5] - 2026-11-28

### Added
- Code slop lexer (`src/extractors/code-slop.js`): extracts comments from JS/TS, Python, Rust, and Kotlin while stripping string literals and docstrings first. Flags `// TODO`, `// ...rest of code`, `pass # TODO`, `raise NotImplementedError`, and `debugger;` on their actual lines. Stubs like `pass # TODO` report once rather than double-firing.
- Secret scanner (`src/extractors/secrets.js`): detects active credentials for OpenAI (`sk-`), Anthropic (`sk-ant-`), GitHub PATs (`ghp_`), AWS access/secret keys, and Stripe (`sk_live_`). Shannon entropy checks generic tokens with placeholder filtering (`your-key-here`, AWS doc samples). Keys are masked to 4 characters; raw credentials are never printed or saved. Leaks exit 1 (or 2 under `--strict`).
- Setup wizard (`slopdeps init`): interactive readline prompt for Lean (deps only), Full (deps + slop + secrets), or Custom profiles. Persists to `.slopdepsrc.json` without overriding custom maps or scopes. Non-interactive environments default to Lean.
- SARIF export maps SD004 for code slop notes and SD005 for secret errors.

### Fixed
- Directories named `.env` in Python venvs no longer prevent `.env` file scanning.
- User-defined slop and secret profiles apply during CLI runs without requiring `--trust-config`.

### Changed
- Bumped version string to `0.0.5` across CLI banner, `--version`, SARIF driver, and registry User-Agents.
- Test suite expanded to 103 tests (103/103 pass).

## [0.0.4] - 2026-11-27

### Added
- AI agent instruction sync: when scans catch hallucinated packages, `slop-deps` writes or updates `SYSTEM.md` in the repo root with the blocked package names and instructions for agents (Cursor, Claude, Copilot) to verify packages via `npx slop-deps check <pkg>` before importing.
- Content outside `<!-- SLOP-DEPS:AI-GUARD -->` delimiters in `SYSTEM.md` is preserved.
- Terminal warning banner alerting developers not to run package install commands while unverified imports remain.
- `slopdeps init` writes `SYSTEM.md` guardrails during hook setup.

### Changed
- Added Test 99 validating `SYSTEM.md` updates and preservation (99/99 pass).

## [0.0.3] - 2026-11-27

### Added
- `check` CLI subcommand: verifies individual packages against registry endpoints before installation (`npx slop-deps check <pkg>`). Exits 0 if found, 1 if missing or typosquatted. Supports `--npm`, `--pypi`, `--crates`, and `--maven`, plus `--json` output.
- Pre-commit hook: `slopdeps init` sets up `.git/hooks/pre-commit` running `slop-deps --staged --strict`.
- Deno and Bun manifest support (`deno.json`, `deno.jsonc`), parsing `npm:` specifiers from `imports` and `scopes`. Handles JSONC comments and UTF-8 BOMs.
- Switched default AI fixer model in `src/ai.js` to `claude-sonnet-5-5`.

### Changed
- Regression suite expanded to 98 passing tests.
- Synchronized version string to `0.0.3` across all CLI banners, SARIF outputs, and registry HTTP User-Agents.

## [0.0.2] - 2026-11-20

### Added
- **Kotlin & Gradle Ecosystem Support**:
  - Full AST dependency extraction for Kotlin script (`.kts`), Kotlin (`.kt`), and Groovy Gradle (`.gradle`) build files.
  - Multi-registry upstream verification across Maven Central (`repo1.maven.org`), Google Maven repository (`dl.google.com`), and Gradle Plugin Portal (`plugins.gradle.org`).
  - Bundled top-popular Maven artifacts in offline corpus with sub-millisecond detection.
- **Browser-Safe Web Bundler Support**:
  - Added build-time browser stubs for web scanners running in client-side Vite/React environments (`slop-deps.pages.dev`).

## [0.0.1-alpha] - 2026-11-18

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
