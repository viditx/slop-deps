# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.0.5] - 2026-11-28

### Added
- **Code Slop Extractor (`src/extractors/code-slop.js`)**:
  - Fast single-pass lexer + regex detection of AI placeholders committed to source: `// TODO`, `// ...rest of code`, `pass  # TODO`, `raise NotImplementedError`, and `debugger;`.
  - String literals, URLs, template text, and docstrings are lexed out, so TODO markers in prose never produce false positives. Works across JS/TS/JSX/TSX, Rust, Kotlin/Gradle (C-style comments) and Python (triple-quote aware).
- **Secrets Scanner (`src/extractors/secrets.js`)**:
  - Zero-dependency leaked-credential scanner for OpenAI (`sk-`/`sk-proj-`), Anthropic (`sk-ant-`), GitHub classic & fine-grained PATs (`ghp_`, `github_pat_`), AWS access key IDs (`AKIA`/`ASIA`), AWS secret access keys, and Stripe secret keys (`sk_live_`/`sk_test_`).
  - Generic high-entropy credential catch via Shannon entropy with placeholder filtering (`your-key-here`, AWS docs examples, `xxx` filler, low-entropy junk all rejected).
  - Findings carry a 4-char masked preview only — raw secrets never leave the scanner or appear in JSON/SARIF/terminal output. Leaks are CRITICAL (exit 1, exit 2 under `--strict`).
- **Interactive `init` Setup Wizard**:
  - `slopdeps init` now asks the user to choose a scanning profile via `node:readline/promises`: `[1] Lean & Fast` (dependencies only), `[2] Full Sentinel Suite` (dependencies + code slop + secrets), `[3] Custom Config` (per-module toggles).
  - Profile persists to `.slopdepsrc.json` (`profile` + `scan` keys), merging safely into existing rc files (builtins, popular, map, privateScopes all preserved).
  - Non-interactive/CI sessions default to `lean`; `--profile lean|full|custom` overrides for scripting. Custom profiles can disable dependency scanning for secrets-only audits.
- **SARIF Rules SD004/SD005**:
  - `codeSlop` (note) and `leakedSecret` (error) rules mapped for GitHub Code Scanning.
- **Expanded Test Suite**:
  - Tests 100–103 validating code slop extraction (line-accurate, string-safe), secret detection across all providers with redaction guarantees, profile-gated sentinel integration via `scanDirectory` (full/lean/custom/`allowConfig:false`), and init wizard profile persistence with rc merge. Adversarial fuzz corpus now covers both new extractors (103/103 tests pass).

### Changed
- Bumped version string to `0.0.5` across CLI banner, `--version`, SARIF driver, and registry User-Agents.

## [0.0.4] - 2026-11-27

### Added
- **AI Agent `SYSTEM.md` Instructions Auto-Sync**:
  - Automatically writes or updates `SYSTEM.md` in the target repository whenever non-existent or hallucinated package imports are detected.
  - Lists the exact blocked package names and injects mandatory rules instructing coding agents (Cursor, Claude Code, Copilot, Antigravity) to run `npx slop-deps check <pkg>` before installing.
  - Seamlessly preserves existing user notes in `SYSTEM.md` using delimited comment boundaries (`<!-- SLOP-DEPS:AI-GUARD:START -->`).
  - `slopdeps init` also initializes `SYSTEM.md` alongside `.git/hooks/pre-commit`.
- **Prominent User Security Warning**:
  - Displays a high-visibility terminal alert banner warning the developer never to run `npm install` or `pip install` while hallucinated dependencies exist.
- **Expanded Test Suite**:
  - Added Test 99 validating `SYSTEM.md` auto-updating, content preservation, and CLI warning output (99/99 tests pass).

## [0.0.3] - 2026-11-27

### Added
- **Ad-hoc Package Verification (`check` subcommand)**:
  - Instant pre-install verification CLI: `npx slop-deps check <package-name> [--npm | --pypi | --crates | --maven]`.
  - Machine-readable `--json` output and exit codes (0: exists/clean, 1: hallucinated/typosquat) for agentic and tool pre-installation validation.
- **Automated Git Pre-Commit Hook (`init` subcommand)**:
  - 1-command zero-dependency git hook installer: `npx slop-deps init`.
  - Configures `.git/hooks/pre-commit` to gate commits with `npx slop-deps --staged --strict`, preventing autonomous agents from silently committing hallucinated imports.
- **Deno & Bun Manifest Support**:
  - Full AST dependency extraction for `deno.json` and `deno.jsonc` manifests.
  - Extracts and resolves `npm:` specifiers from top-level `imports` and path-specific `scopes`.
  - Built-in support for single-line (`//`), multi-line (`/* */`) JSONC comments, and UTF-8 BOM headers.
  - Auto-discovers local workspace packages and private organizational scopes from root Deno configurations.
- **Anthropic Claude Sonnet 5.5 Support**:
  - Upgraded default AI auto-repair model in `src/ai.js` to `claude-sonnet-5-5` for higher accuracy refactoring (Resolves #3).
- **Deterministic AST vs Prompting Architecture FAQ**:
  - Documented deterministic compiler-level security defense against AI hallucination drift (The Prologic Defense).
- **GitHub Actions CI Automation**:
  - Standard 3-line copy-paste CI workflow for pre-merge pipeline gates (`npx slop-deps --strict`).

### Changed
- Expanded automated regression suite to 98 passing tests.
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
