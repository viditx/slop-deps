# slop-deps

**by Lazy Dev (Vidit Patil)**

**Stop AI dependency hallucinations from reaching your lockfile.**

AI models (Claude, Cursor, Copilot, ChatGPT) confidently invent package names that do not exist on package registries. Attackers crawl public repos for these 404 imports, register them with malicious payloads, and wait for developers or CI runners to run `npm install`, `pip install`, or `cargo build`.

`slop-deps` statically extracts every package import from source code and manifests, verifying each one directly against upstream registries before it ever enters a lockfile. Zero runtime dependencies. Sub-second execution.

**Proof it works:** In a controlled A/B evaluation across real AI-generated code, standard package managers accepted 100% of hallucinated imports silently. `slop-deps` caught 6/6 (100%) in <20ms. Full benchmark breakdown in [`docs/eval-report.html`](docs/eval-report.html).

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![Dependencies: Zero](https://img.shields.io/badge/Dependencies-0-success.svg)](package.json)
[![Node.js: >=18](https://img.shields.io/badge/Node.js-%3E%3D18-brightgreen.svg)](https://nodejs.org)

---

## Install

### Option 1 — Zero install (npx)

Run directly in any project:

```bash
npx slop-deps
```

### Option 2 — Windows Interactive Installer

Download and run `installer.exe` from releases:
- Chooses installation path (default: `%LOCALAPPDATA%\Programs\slop-deps`).
- Real-time command shortcut conflict detection (prevents overriding system binaries like `git` or `node`).
- Injects global shims (`slopdeps.cmd`, `slopdeps.ps1`) directly into Windows User PATH.

### Option 3 — From GitHub

```bash
git clone https://github.com/viditx/slop-deps.git
cd slop-deps
npm link
slopdeps
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

# Machine-readable output for CI/CD
slopdeps --json
slopdeps --sarif > results.sarif

# Fail-closed strict mode (exit code 2 on warnings)
slopdeps --strict
```

---

## Repository Layout

```text
slop-deps/
├── README.md               ← you are here
├── package.json            ← zero external dependencies
├── bin/
│   └── slop-deps.js        ← standalone CLI runner
├── src/                    ← core verification engine
│   ├── index.js            ← directory traversal & extractor coordinator
│   ├── reporter.js         ← clean compiler-grade diagnostics
│   ├── builtins.js         ← Node.js, Python, and OS built-in modules
│   ├── typosquat.js        ← Damerau-Levenshtein & lookalike matcher
│   ├── pypi-map.js         ← Python import to distribution mappings
│   ├── extractors/         ← pure JS/TS, Python, and Rust parsers
│   └── registries/         ← npm, PyPI, Crates.io probes & TTL cache
├── installer.iss           ← Inno Setup 6 interactive installer script
├── demo/                   ← test fixtures with intentional hallucinations
├── test/
│   └── run-tests.js        ← 61 deterministic assertion suites
└── docs/
    └── eval-report.html    ← interactive A/B benchmark evaluation report
```

---

## License

MIT © [Vidit Patil](https://github.com/viditx)
