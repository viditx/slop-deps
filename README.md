# slop-deps

**by Lazy Dev (Vidit Patil)**

**Stop AI dependency hallucinations and slopsquatting before they reach your lockfile.**

AI code assistants (Claude, Cursor, Copilot, ChatGPT) confidently invent packages that do not exist on public registries. Attackers crawl public commits and PRs for these 404 imports, register them with malicious payloads, and wait for developers or CI runners to execute `npm install`, `pip install`, or `cargo build`.

`slop-deps` statically inspects your source code and manifests, verifying every imported dependency directly against upstream registries and local popularity corpuses **before** any installation script runs. 

Zero external dependencies. Sub-second execution. Fail-closed security.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![Dependencies: Zero](https://img.shields.io/badge/Dependencies-0-success.svg)](package.json)
[![Tests: 79 Passing](https://img.shields.io/badge/Tests-79%2F79%20PASS-brightgreen.svg)](test/run-tests.js)
[![Node.js: >=18](https://img.shields.io/badge/Node.js-%3E%3D18-brightgreen.svg)](https://nodejs.org)
[![Platform: Cross--Platform](https://img.shields.io/badge/Platform-Windows%20%7C%20Linux%20%7C%20macOS-informational.svg)](installer.iss)

---

## ⚡ Quick Demo

```text
$ slopdeps

  slop-deps v1.0.0-alpha — Sentinel against AI dependency hallucinations
  Scanning target: C:\dev\my-app (84 files, 142 package references)

  CRITICAL  fake-jwt-decoder-super-auth-xyz  (npm)
            src/auth/jwt.ts:4
            Package DOES NOT EXIST on npm. Potential AI hallucination trap!
            Did you mean 'jsonwebtoken'?

  WARN      reqeusts  (pypi)
            services/api.py:12
            Typosquat risk: name is 1 edit from 'requests'. Inspect before installing.

  VERIFIED  @uber/internal-telemetry  (npm)
            src/telemetry.ts:2
            Private enterprise scope '@uber' (configured via .npmrc).

  VERIFIED  react  (npm)  [bundled corpus]
  VERIFIED  torch  (pypi) [bundled corpus]

  Summary: 2 flagged (1 CRITICAL, 1 WARN), 140 clean. 
  Elapsed: 142ms. Exit code: 2
```

---

## Why Pre-Lockfile Verification Matters

Security tools like `npm audit`, `pip-audit`, or Snyk run **after** a lockfile is generated or packages are installed. 

This creates a fatal blindspot:
1. An LLM outputs code containing `import { magic } from 'react-magic-super-spring-xyz'`.
2. The developer or script adds it and runs `npm install`.
3. **npm immediately executes the package's `preinstall` / `postinstall` lifecycle hook**.
4. The attacker's payload executes arbitrary code, exfiltrating `.env` secrets or SSH keys before any traditional audit tool can inspect the tree.

**`slop-deps` shifts detection to pre-install time:** it analyzes raw `.js`, `.ts`, `.py`, `.rs`, and uncommitted manifests to kill hallucinations at the gate.

---

## The 4-Layer Defense Architecture

| Layer | Component | How It Works |
|:---|:---|:---|
| **1. Multi-Language Lexical Extractor** | Pure Node AST/Lexer | Scans JS/TS, Python, and Rust source code + manifests without external parsers. Supports static string concatenation, dynamic imports, JSX isolation, and type-only imports. |
| **2. Bundled Popularity Corpus** | 4,179 Curated Packages | Zero-network verification for top ecosystem giants (React, Lodash, NumPy, PyTorch, Serde). Answers popular imports instantly with zero telemetry. |
| **3. Upstream Registry Probe & Cache** | Direct HTTPS Probes | Direct HEAD/GET checks to `registry.npmjs.org`, `pypi.org`, and `crates.io` with persistent TTL disk caching to avoid rate limits. |
| **4. Offline Typosquat Engine** | Damerau-Levenshtein + Homoglyphs | Detects visual lookalike characters, confusable homoglyphs, and single-edit squatting traps targeting popular packages (`reqeusts` → `requests`). |

---

## Installation & Distribution

### Option 1 — Windows Standalone Installer (Recommended)

Download `slopdeps-installer.exe` from [releases](https://github.com/viditx/slop-deps/releases) or the marketing site:
- Standalone launcher bundled into `%LOCALAPPDATA%\Programs\slop-deps`.
- Collision-free Windows User PATH registration (`slopdeps.cmd`, `slopdeps.ps1`, `slopdeps.exe`).
- Clean uninstaller included with safe PATH cleanup.

### Option 2 — From Source / Private Beta

```bash
git clone https://github.com/viditx/slop-deps.git
cd slop-deps
npm link
slopdeps
```

*(Note: Public npm publishing via `npx slop-deps` will unlock at public launch — see [DISTRIBUTION.md](DISTRIBUTION.md).)*

### Option 3 — GitHub Action (CI/CD)

Block hallucinated PRs directly in GitHub Actions:

```yaml
name: AI Dependency Guard
on: [push, pull_request]

jobs:
  audit:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: viditx/slop-deps@main
        with:
          strict: 'true'
          sarif: 'true'
```

---

## CLI Command Reference

```bash
# Scan current repository
slopdeps

# Scan a specific directory or monorepo workspace
slopdeps ./frontend

# Fast pre-commit mode: scan only git-staged files
slopdeps --staged

# Air-gapped / privacy mode (local corpus & cache only, zero network)
slopdeps --offline

# AI-assisted auto-fix for flagged imports (BYOK)
slopdeps --fix

# Machine-readable output for CI/CD pipelines
slopdeps --json
slopdeps --sarif > results.sarif

# Fail-closed strict mode (exit code 2 on warnings or errors)
slopdeps --strict
```

### Complete CLI Flags

| Flag | Name | Purpose |
|:---|:---|:---|
| `-d, --dir <path>` | Target Directory | Specify directory to scan (default: current working directory). |
| `--staged` | Git Staged Mode | Fast pre-commit scanner: only checks files currently staged in git. |
| `--offline, --private` | Air-Gapped Mode | Zero outbound network calls; verifies via bundled corpus + local cache. |
| `--fix` | AI Auto-Repair | BYOK AI-assisted import repair with atomic `.slop-deps.bak` backups and secondary hallucination guards. |
| `--trust-config` | Config Override | Load custom project rules from `.slopdepsrc.json`. |
| `--clear-cache` | Wipe Cache | Clear local registry verdict cache. |
| `--update-corpus` | Refresh Corpus | Fetch fresh top-popularity package lists from upstream registries. |
| `--json` | JSON Stream | Output structured findings and telemetry as JSON. |
| `--sarif` | SARIF 2.1.0 | Emit SARIF payload for native GitHub Code Scanning integration. |
| `--strict` | Fail-Closed Gate | Exit with code 2 on critical findings, typosquats, or network errors. |
| `-v, --version` | Version Info | Print installed engine version (`v1.0.0-alpha`). |
| `-h, --help` | Help Menu | Display full usage instructions. |

---

## Enterprise & Monorepo Features

### 🏢 Automatic Private Scope Discovery
Corporate monorepos often use internal packages (`@mycorp/auth`, `@internal/logger`) that do not exist on public npmjs.org. `slop-deps` eliminates false 404s via 4 automatic resolution channels:
1. **`.npmrc` Auto-Discovery:** Automatically scans `.npmrc` for `@scope:registry=...` lines.
2. **Root Package Inheritance:** If the root `package.json` is scoped (e.g. `@mycorp/app`), all `@mycorp/*` packages are recognized as internal.
3. **`.slopdepsrc.json`:** Add custom enterprise scopes:
   ```json
   {
     "privateScopes": ["@mycorp", "@internal"],
     "ignoreScopes": ["@legacy"]
   }
   ```
4. **Environment Variables:** Set `SLOP_DEPS_PRIVATE_SCOPES=@mycorp,@internal`.

### 🛡️ Secondary Hallucination Guard (`--fix`)
When running `--fix` with BYOK AI models, `slop-deps` enforces a strict mathematical safety gate:
- AI-proposed replacements are statically extracted and verified against registries/corpuses **before** anything is written to disk.
- If the AI model invents another non-existent package as a replacement, `slop-deps` rejects the fix with an explicit secondary hallucination warning and preserves user code byte-for-byte.

---

## Repository Architecture

```text
slop-deps/
├── README.md               ← Documentation & quickstart
├── package.json            ← Zero external runtime dependencies
├── action.yml              ← GitHub Action definition
├── DISTRIBUTION.md         ← Distribution & access policies
├── PRIVACY.md              ← Zero-telemetry & air-gap guarantees
├── bin/
│   ├── slop-deps.js        ← Standalone Node.js CLI runner
│   └── slopdeps.exe        ← Native Windows launcher stub
├── src/                    ← Core verification engine
│   ├── index.js            ← Directory traversal & multi-ecosystem coordinator
│   ├── reporter.js         ← Compiler-grade terminal diagnostics
│   ├── sarif.js            ← SARIF 2.1.0 generator for GitHub Security tab
│   ├── builtins.js         ← Node.js, Python, and Rust standard library modules
│   ├── typosquat.js        ← Damerau-Levenshtein distance & confusable matcher
│   ├── pypi-map.js         ← Python import-to-distribution resolution mappings
│   ├── fixer.js            ← AI repair engine with secondary hallucination guards
│   ├── ai.js               ← BYOK multi-provider client (Gemini / OpenAI / Anthropic)
│   ├── corpus.generated.js ← Bundled popularity corpus (4,179 packages)
│   ├── extractors/         ← Pure JS/TS, Python, and Rust AST/Lexer extractors
│   └── registries/         ← npm, PyPI, Crates.io probes & local TTL cache
├── installer.iss           ← Inno Setup 6 compiler configuration
├── test/
│   └── run-tests.js        ← 79 deterministic automated regression assertions
└── site/                   ← Morpho WebGL landing page & client-side scanner
```

---

## Test Suite & Verification

The test suite covers 79 deterministic test assertions across CLI arguments, parser edge cases, AST string concatenations, private scope resolutions, and red-team injection attempts:

```bash
# Run full regression suite (CLI + Site integration)
node test/run-tests.js
```

```text
🧪 Running slop-deps test suite...
  ✔ PASS: src/ contains zero external dependencies
  ✔ PASS: All 5 hallucinated fixtures caught across JS, Python, Rust, manifests
  ...
  ✔ PASS: static string concatenation in import/require resolved cleanly (Test 77)
  ✔ PASS: enterprise private scopes in .npmrc verified without false 404s (Test 78)
  ✔ PASS: fixer secondary hallucination guard prevents circular AI traps (Test 79)

🎉 All 79 test assertions passed successfully!
```

---

## License

MIT © [Vidit Patil](https://github.com/viditx)
