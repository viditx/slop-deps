# slop-deps

> **Architected by a 15-year-old. Engineered by AI.**  
> Catch hallucinated, non-existent npm, PyPI, and Crates.io packages *before* you run `install` and get owned.

```
$ slopdeps . --ci

   SCAN COMPLETE — 4,179 packages verified · 0 hallucinations · 79/79 test suite PASS
   Elapsed: 142ms · Zero external dependencies · Fail-closed security
```

Zero external dependencies. Zero telemetry. Sub-second execution. Pure Node.js standard library.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![Dependencies: Zero](https://img.shields.io/badge/Dependencies-0-success.svg)](package.json)
[![Tests: 79 Passing](https://img.shields.io/badge/Tests-79%2F79%20PASS-brightgreen.svg)](test/run-tests.js)
[![Node.js: >=18](https://img.shields.io/badge/Node.js-%3E%3D18-brightgreen.svg)](https://nodejs.org)
[![Platform: Cross--Platform](https://img.shields.io/badge/Platform-Windows%20%7C%20Linux%20%7C%20macOS-informational.svg)](installer.iss)

---

> [!WARNING]
> **EXPERIMENTAL ALPHA (v1.0.0-alpha)**
> This is an honest alpha release. 
> - **Security:** Designed to catch typosquats and AI dependency hallucinations *before* your package manager runs lifecycle scripts.
> - **Zero-Dep:** Runs on pure Node.js stdlib with zero runtime bloat.
> - **Honest Alpha:** Read the *Known Limitations (No Bullshit)* section below before filing issues about dynamic computed imports.

---

Hey there, I am a 15-year-old developer (Lazy Dev). I architected this tool with AI agents. Let me clarify: this wasn't built in one lazy prompt. I spent weeks directing AI agents, putting this through 3 brutal red-team security audits, and enforcing 79 deterministic regression tests until zero false positives remained.

Let's be completely real: AI coding assistants (Claude, Cursor, Copilot, ChatGPT) write a massive chunk of our code now. And late at night, when an LLM is in deep hallucination mode, it invents package names that simply don't exist on public registries:
- `fake-jwt-decoder-super-auth-xyz`
- `flask-auth-handler`
- `react-magic-super-spring-xyz`
- `chalk-colors-next`

### Why This Is Dangerous (And Why `npm audit` is Useless)

When an attacker crawls public GitHub commits, PRs, or AI benchmarks, they spot these 404 imports, quickly register the exact hallucinated name on npm or PyPI with a malicious `preinstall` or `setup.py` payload, and wait.

The moment you copy-paste the AI snippet and type `npm install` or `pip install`:
1. **Your package manager immediately downloads and executes the package's lifecycle scripts (`preinstall`, `install`, `postinstall`).**
2. The attacker's payload executes arbitrary code in your shell, exfiltrating `.env` secrets, tokens, or SSH keys before any linter or compiler runs.
3. Traditional tools like `npm audit`, `pip-audit`, or Snyk only inspect the dependency tree **after** the package is already downloaded and the malicious install hook has already executed.

**`slop-deps` shifts detection to pre-install time:** it statically scans your raw `.js`, `.ts`, `.py`, `.rs`, and uncommitted manifests to kill hallucinations *before* anything touches your disk or package manager.

---

## ⚡ The Quick Demo

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

## 🛡️ The 4-Layer Defense Architecture

| Layer | Component | How It Works |
|:---|:---|:---|
| **1. Multi-Language Lexical Extractor** | Pure Node AST/Lexer | Scans JS/TS, Python, and Rust source code + manifests without heavy dependencies. Supports static binary string concatenations (`'a' + 'b'`), dynamic imports, JSX isolation, and type-only imports. |
| **2. Bundled Popularity Corpus** | 4,179 Curated Packages | Zero-network verification for top ecosystem giants (React, Lodash, NumPy, PyTorch, Serde). Answers popular imports in sub-millisecond time with zero telemetry. |
| **3. Upstream Registry Probe & Cache** | Direct HTTPS Probes | Direct HEAD/GET checks to `registry.npmjs.org`, `pypi.org`, and `crates.io` with persistent TTL disk caching to prevent network spam. |
| **4. Offline Typosquat Engine** | Damerau-Levenshtein + Homoglyphs | Detects visual lookalike characters, confusable homoglyphs, and single-edit squatting traps targeting popular packages (`reqeusts` → `requests`). |

---

## 🏢 Enterprise & Monorepo Features

### 1. Automatic Private Scope Discovery
Corporate monorepos use internal packages (`@mycorp/auth`, `@internal/logger`) that obviously don't exist on public npmjs.org. `slop-deps` won't spam you with false 404s thanks to 4 auto-resolution channels:
1. **`.npmrc` Auto-Discovery:** Automatically parses `.npmrc` for `@scope:registry=...` lines.
2. **Root Package Inheritance:** If the root `package.json` has a scoped name (e.g. `@mycorp/app`), all `@mycorp/*` imports are recognized as internal.
3. **`.slopdepsrc.json`:** Add custom enterprise scopes:
   ```json
   {
     "privateScopes": ["@mycorp", "@internal"],
     "ignoreScopes": ["@legacy"]
   }
   ```
4. **Environment Variables:** Set `SLOP_DEPS_PRIVATE_SCOPES=@mycorp,@internal`.

### 2. Secondary Hallucination Guard (`--fix`)
When running `--fix` with BYOK AI models, `slop-deps` enforces a strict mathematical safety gate:
- AI-proposed replacements are statically extracted and verified against registries/corpuses **before** anything is written to disk.
- If the AI model invents another non-existent package as a replacement, `slop-deps` rejects the fix with an explicit secondary hallucination warning and preserves your code byte-for-byte.

---

## 🚫 Known Limitations (No Bullshit)

We believe in complete honesty about what this engine can and cannot do:

1. **Fast Lexer, Not a Full TypeScript Compiler:** We use a high-speed, zero-dependency regex/lexer engine. It cleanly handles static string concatenation (`require('a' + 'b')`), dynamic imports, and standard module formats. But if you do crazy runtime obfuscation like `import(eval('rot13(...)'))`, it won't resolve.
2. **Private Registries Need Config:** If your internal packages are not published on public npm or PyPI, you must declare your scopes via `.npmrc` or `.slopdepsrc.json`. Otherwise, `slop-deps` will honestly tell you the package is missing on public registries.
3. **Registry Rate Limits on Huge Cold Scans:** If you scan a project with 500+ completely obscure dependencies in one shot without an active cache, public npm/PyPI endpoints might rate-limit your IP. Use `--offline` if you're in an air-gapped environment.
4. **BYOK (Bring Your Own Key) for `--fix`:** The auto-repair feature requires your own API key (Gemini, OpenAI, or Anthropic). We do not run a centralized cloud proxy that touches your code.

---

## 📦 Installation & Usage

### Option 1 — Run Instantly via npx (Zero Install)

```bash
# Run scanner immediately on any repository or directory
npx slop-deps

# Or install globally across your machine
npm install -g slop-deps
slopdeps
```

### Option 2 — Windows Standalone Installer

Download `slopdeps-installer.exe` from [releases](https://github.com/viditx/slop-deps/releases) or the marketing site:
- Standalone launcher bundled into `%LOCALAPPDATA%\Programs\slop-deps`.
- Collision-free Windows User PATH registration (`slopdeps.cmd`, `slopdeps.ps1`, `slopdeps.exe`).
- Clean uninstaller included with safe PATH cleanup.

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

## 💻 CLI Command Reference

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

## 💡 How This Was Built

**Architected by me (15yo), engineered with AI agents over weeks of relentless audit cycles.**

I don't manually type out 4,000 lines of regex lexers and registry parsers. What I do is act as the Architect and Director:
- **Zero-Dependency Mandate:** Enforced pure Node.js standard library with zero external runtime packages.
- **Strict Verification Gating:** Built an automated 79-test deterministic regression suite. Every single bug, edge case, and bypass attempt gets an explicit test assertion before code is approved.
- **Relentless Red-Team Audits:** Ran 3 rounds of ruthless red-team security audits to hunt down parser blindspots, TOML comment escapes, and importmap oddities.
- **Verified Windows Packaging:** Native Inno Setup 6 installer with verified PE resource headers.

If you hit an unhandled syntax or a false positive, open an issue with your code snippet or terminal logs.

---

## License

MIT © [Vidit Patil](https://github.com/viditx)

*Made for devs who code at 2 AM with AI agents. Good luck with your hallucinated packages.*
