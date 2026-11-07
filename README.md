# slop-deps

**by Lazy Dev (Vidit Patil)**

**Stop AI dependency hallucinations from reaching your lockfile.**

AI models (Claude, Cursor, Copilot, ChatGPT) confidently invent package names that do not exist on package registries. Attackers crawl public repos for these 404 imports, register them with malicious payloads, and wait for developers or CI runners to run `npm install`, `pip install`, or `cargo build`.

`slop-deps` statically extracts every package import from source code and manifests, verifying each one directly against upstream registries before it ever enters a lockfile. Zero runtime dependencies. Sub-second execution.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![Dependencies: Zero](https://img.shields.io/badge/Dependencies-0-success.svg)](package.json)
[![Node.js: >=18](https://img.shields.io/badge/Node.js-%3E%3D18-brightgreen.svg)](https://nodejs.org)

---

## Install & Access

### Option 1 — Windows Interactive Installer (Recommended)

Download and run `installer.exe` from [releases](https://github.com/viditx/slop-deps/releases) or the marketing site:
- Installs standalone binary and zero-dependency runtime to `%LOCALAPPDATA%\Programs\slop-deps`.
- Collision-free Windows User PATH registration (`slopdeps.cmd`, `slopdeps.ps1`).
- Clean uninstaller included with safe PATH entry cleanup.

### Option 2 — From Source (Private Beta)

If you have repository access during the private beta:

```bash
git clone https://github.com/viditx/slop-deps.git
cd slop-deps
npm link
slopdeps
```

*(Note: Package is in private distribution. Public npm publishing via `npx slop-deps` will be available at general public launch — see [DISTRIBUTION.md](DISTRIBUTION.md).)*

### Option 3 — GitHub Action (CI/CD)

Add to your GitHub Actions workflow:

```yaml
- uses: viditx/slop-deps@main
  with:
    strict: 'true'
```


---

## The 3-Layer Defense Matrix

| Layer | What it is | Fixes |
|---|---|---|
| **1. Multi-Manifest AST Extractor** | Zero-dependency parser for JS, TS, Python, and Rust source files + manifests | Phantom imports in code before `package.json` or `requirements.txt` is updated |
| **2. Upstream Registry Probe** | Direct HTTPS probe to npm, PyPI, and Crates.io with local verdict TTL cache | Hallucinated packages that do not exist on public registries |
| **3. Offline Typosquat Engine** | Damerau-Levenshtein distance + visual lookalike homoglyph corpus matching | Attackers registering subtle typos of popular packages (`reqeusts` -> `requests`) |

---

## Verification Tiers

| Level | Meaning | Action |
|:---|:---|:---|
| **CRITICAL** | Package does not exist on npm, PyPI, or Crates.io. | Remove or replace immediately. |
| **WARN** | Package name closely mimics an established registry giant (typosquat). | Verify publisher identity and spellings. |
| **CLEAN** | Verified established package on the registry. | Safe to install. |

### Standard Library & Built-in Modules

Standard library and runtime modules (such as Python's `os`, `sys`, `json`, `pathlib`, or Node's `node:fs`, `path`) are recognized directly by `src/builtins.js`:
- **CLI Engine:** Automatically recognized and excluded from external registry lookups, ensuring zero network calls and clean passes.
- **Web Inspector:** Rendered explicitly as `VERIFIED` with reason `standard library module` (green badge), confirming to developers that builtins are recognized without triggering false hallucination alerts.

---

## CLI Usage

```bash
# Scan current repository
slopdeps

# Scan a specific directory or monorepo package
slopdeps ./frontend

# Scan only git-staged files (ideal for pre-commit hooks)
slopdeps --staged

# Air-gapped / privacy mode (local corpus & cache only, zero network)
slopdeps --offline

# AI-assisted auto-fix for flagged imports (BYOK)
slopdeps --fix

# Machine-readable output for CI/CD
slopdeps --json
slopdeps --sarif > results.sarif

# Fail-closed strict mode (exit code 2 on warnings)
slopdeps --strict
```

### Complete CLI Flags Reference

| Option | Flag | Description |
|---|---|---|
| **Target Directory** | `-d, --dir <path>` | Specify custom project directory to scan (default: current working directory). |
| **Git Staged** | `--staged` | Fast pre-commit mode: scans only files currently staged in git index. |
| **Air-gapped Mode** | `--offline, --private` | Zero outbound network calls; relies on bundled popular corpus + local TTL cache. |
| **AI Auto-Repair** | `--fix` | BYOK AI-assisted import repair with safe `.slop-deps.bak` backups. |
| **Trust Config** | `--trust-config` | Load custom repository configuration from `.slopdepsrc.json`. |
| **Clear Cache** | `--clear-cache` | Wipe the local registry verdict cache and exit. |
| **Corpus Update** | `--update-corpus` | Refresh the auto-generated typosquat corpus from live upstream registries. |
| **Machine JSON** | `--json` | Stream findings and statistics as raw JSON for CI/CD runners. |
| **SARIF 2.1.0** | `--sarif` | Emit SARIF 2.1.0 payload for native GitHub Code Scanning integration. |
| **Fail-Closed** | `--strict` | Exit code 2 on suspicious packages, typosquats, or network errors. |
| **Version** | `-v, --version` | Print installed engine version. |
| **Help** | `-h, --help` | Display usage help and exit codes. |


---

## Repository Layout

```text
slop-deps/
├── README.md               ← you are here
├── package.json            ← zero external dependencies
├── action.yml              ← GitHub Action integration
├── DISTRIBUTION.md         ← private beta architecture & release posture
├── PRIVACY.md              ← privacy audit & zero-telemetry guarantee
├── bin/
│   └── slop-deps.js        ← standalone CLI runner
├── src/                    ← core verification engine (~3,180 lines)
│   ├── index.js            ← directory traversal & extractor coordinator
│   ├── reporter.js         ← clean compiler-grade diagnostics
│   ├── sarif.js            ← SARIF 2.1.0 generator for GitHub Code Scanning
│   ├── builtins.js         ← Node.js, Python, and OS built-in modules
│   ├── typosquat.js        ← Damerau-Levenshtein & lookalike matcher
│   ├── pypi-map.js         ← Python import to distribution mappings
│   ├── fixer.js            ← BYOK AI automated hallucination fixer
│   ├── ai.js               ← OpenAI / Anthropic / local LLM provider client
│   ├── update-corpus.js    ← popular packages corpus update utility
│   ├── corpus.generated.js ← bundled top-tier popularity corpus (npm, PyPI)
│   ├── extractors/         ← pure JS/TS, Python, and Rust parsers
│   └── registries/         ← npm, PyPI, Crates.io probes & TTL cache
├── installer.iss           ← Inno Setup 6 interactive installer script
├── demo/                   ← test fixtures with intentional hallucinations
├── test/
│   └── run-tests.js        ← 61 deterministic assertion suites
└── site/                   ← marketing landing page & client-side scanner
```

---

## Development & Releases

### Cutting Release Snapshots

To guarantee clean distribution archives without uncommitted drift, transient build outputs, or debug artifacts (such as `.pdb` files), all release snapshots must be created directly from git:

```bash
# Export clean snapshot matching HEAD
git archive --format=zip -o slop-deps-v1.4.0.zip HEAD
```

Every snapshot produced by `git archive` contains all tracked core engine sources, marketing site source files, self-hosted fonts, and verified installer assets, and is guaranteed to pass full clean-build verification (`npm ci && npm run build` in `site/morpho`).

---

## License

MIT © [Vidit Patil](https://github.com/viditx)
