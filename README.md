# slop-deps

> Your AI invents package names that don't exist. Attackers register those names and wait for someone to install them. This catches it — before it reaches your lockfile.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![Dependencies: Zero](https://img.shields.io/badge/Dependencies-0-success.svg)](package.json)
[![Node.js: >=18](https://img.shields.io/badge/Node.js-%3E%3D18-brightgreen.svg)](https://nodejs.org)

```
   ███████╗██╗      ██████╗ ██████╗       ██████╗ ███████╗██████╗ ███████╗
   ██╔════╝██║     ██╔═══██╗██╔══██╗      ██╔══██╗██╔════╝██╔══██╗██╔════╝
   ███████╗██║     ██║   ██║██████╔╝█████╗██║  ██║█████╗  ██████╔╝███████╗
   ╚════██║██║     ██║   ██║██╔═══╝ ╚════╝██║  ██║██╔══╝  ██╔═══╝ ╚════██║
   ███████║███████╗╚██████╔╝██║           ██████╔╝███████╗██║     ███████║
   ╚══════╝╚══════╝ ╚═════╝ ╚═╝           ╚═════╝ ╚══════╝╚═╝     ╚══════╝
   AI Dependency Hallucination & Supply-Chain Sentinel • v1.4.0
```

Straight talk, no filler:

Cursor/Copilot/Claude suggest package names that **don't exist** in 5–21% of cases. And those names repeat — about 43% of hallucinated names show up again across runs, per [Cloud Security Alliance research](https://labs.cloudsecurityalliance.org/research/csa-research-note-slopsquatting-ai-supply-chain-20260419-csa). That makes it easy money for attackers: grab the same phantom names, register them on npm, stuff malware inside, wait. It's called **slopsquatting**, and it's not theoretical — names like `react-codeshift` have already been claimed.

slop-deps is the direct answer: **one command, zero setup, every import checked** — in source code, in manifests, across three ecosystems (npm / PyPI / crates.io).

---

## Quick Start

No install step. Just:

```bash
npx slop-deps
```

Or clone and run locally:

```bash
git clone https://github.com/viditx/slop-deps.git
cd slop-deps
npm link
slop-deps
```

10-second proof: the repo ships a `demo/` folder full of real hallucinated imports. Run `npx slop-deps --dir demo` and watch the red CRITICAL flags.

---

## The Threat: Package Hallucination (Slopsquatting)

AI coding models (Claude, Cursor, Copilot, ChatGPT) confidently invent library names that were never published:

```typescript
// hallucinated by an AI agent:
import { formatRelativeDate } from 'date-fns-relative'; 
import { useTactileSpring } from 'react-smooth-springs';
```

Neither exists on npm. The attacker workflow:

1. Crawl public commits, PRs, and AI-generated boilerplates for 404 imports.
2. Register those phantom names on **npm** or **PyPI** — reverse shells, crypto stealers, environment exfiltration.
3. The next developer or CI runner that runs `npm install` / `pip install` gets compromised.

`slop-deps` reads raw source + manifests and verifies every import against live registries — **before it's pushed, before it's built**.

---

## Verification Tiers

| Status | Risk Level | Meaning |
| :--- | :--- | :--- |
| **HALLUCINATED** | **CRITICAL** | Package doesn't exist on npm/PyPI. An attacker can register it right now. Remove immediately. |
| **SUSPICIOUS** | **HIGH** | Registered within 30 days with ≤2 releases. Or typosquat / install-script signals. Inspect carefully. |
| **VERIFIED** | **CLEAN** | Established package with verified release history. |

---

## Core Capabilities

* **Zero Dependencies:** Built entirely on Node.js 18+ native APIs (`fetch`, `fs/promises`). A supply-chain auditor that depends on nobody — that's the whole point.
* **Typosquat Engine:** Damerau-Levenshtein matching with confusable-character normalization (`m0rgan` → `morgan`, `reqeusts` → `requests`) against a bundled corpus — **fully offline, zero network**. A new package one edit away from a giant gets flagged; established ones only get a heads-up.
* **Install-Script Signal:** Young packages shipping `preinstall`/`install`/`postinstall` scripts — the classic npm malware pattern — are escalated to SUSPICIOUS automatically.
* **File-Level AST Parsing:** Imports are scanned from source (`.js`, `.ts`, `.tsx`, `.vue`, `.svelte`, `.astro`, `.py`, `.pyi`) before they ever reach a manifest.
* **Manifest Coverage:** `package.json` (incl. `bundledDependencies`), `requirements*.txt`, `constraints.txt`, `pyproject.toml`, `setup.cfg`, `Pipfile`, `setup.py`.
* **Monorepo Aware:** Internal workspace packages (`workspace:*`, `file:`, `link:`) are detected and ignored — Turborepo, Nx, pnpm.
* **Rust / Cargo Support:** `use` paths and `extern crate` in `.rs` sources, `Cargo.toml` manifests, live crates.io verification (with hyphen/underscore name variants — the Rust quirk).
* **Smart Namespace Mapping:** Python import→distribution aliases (`yaml` → `PyYAML`, `cv2` → `opencv-python`, `PIL` → `Pillow`) and PEP 420 namespaces (`google.cloud.*`, `azure.*`, `opentelemetry.*`).
* **Noise Filtering:** stdlib built-ins, framework aliases (`$lib`, `@@/`), `tsconfig.json` path mappings — all ignored. Signal, not noise.
* **Fail-Closed Exit Codes:** `exit 1` on criticals, `exit 2` on missing dirs/network errors, `exit 0` on clean. Plug into CI and forget.

---

## CLI Usage

```bash
# scan current directory
slop-deps

# scan a specific directory
slop-deps --dir ./src

# raw JSON for pipelines
slop-deps --json

# SARIF 2.1.0 for GitHub code scanning
slop-deps --sarif > slop-deps.sarif

# only git-staged files (pre-commit hook)
slop-deps --staged

# offline scan — persistent cache + bundled corpus, zero network
slop-deps --offline

# refresh the typosquat corpus from live registries
slop-deps --update-corpus

# let a BYOK AI fix hallucinated imports (backups: *.slop-deps.bak)
SLOP_AI_KEY=sk-... npx slop-deps --fix

# point fixes at a local model — nothing leaves your machine
SLOP_AI_BASE_URL=http://127.0.0.1:11434/v1 npx slop-deps --fix

# fail if network verification is incomplete
slop-deps --strict

# options
slop-deps --help
```

## Privacy

**No telemetry. No accounts. No data collection.** A scan's only network traffic is GET lookups of package names against registry.npmjs.org and pypi.org — the same requests any package manager sends. Full breakdown in [PRIVACY.md](PRIVACY.md) — don't take my word for it, run `grep -rn "fetch(" src/` and verify. Two commands for full control:

```bash
npx slop-deps --private      # zero-network scan: bundled corpus + local cache only
npx slop-deps --clear-cache  # wipe the local verdict cache
```

### Project config (`.slopdepsrc.json`)

Private toolchains and monorepos can teach slop-deps their world — no forks needed:

```json
{
  "builtins": { "npm": ["acme-internal-sdk"], "pypi": ["acme_lib"] },
  "popular": { "npm": ["acme-enterprise-suite"] },
  "map": { "my_custom_import": "my-custom-dist" }
}
```

- `builtins` — never verified against registries (internal packages)
- `popular` — added to the typosquat corpus (protect your org's flagship names)
- `map` — custom import-name → distribution-name mappings

### Self-updating corpus

The typosquat engine runs on **3,000+ npm and 1,000+ PyPI names** — curated entries merged with a registry-generated list (`src/corpus.generated.js`). Regenerate with `slop-deps --update-corpus` (or a monthly CI job) so the corpus never rots.

### Pre-commit hook

```yaml
# .pre-commit-config.yaml
repos:
  - repo: local
    hooks:
      - id: slop-deps
        name: slop-deps staged scan
        entry: npx --yes slop-deps --staged
        language: system
        pass_filenames: false
        stages: [pre-commit]
```

---

## CI/CD Integration (GitHub Actions)

Block hallucinated imports in pull requests automatically:

```yaml
name: Security Audit

on: [push, pull_request]

jobs:
  slop-check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - name: Scan for Hallucinated Dependencies
        run: node bin/slop-deps.js --dir . --strict
```

---

## Philosophy

> If it looks like too much, it's fake.

The scanner holds itself to the standard it audits in others: zero dependencies, zero install scripts, zero telemetry, read-only filesystem. Every claim in [PRIVACY.md](PRIVACY.md) comes with the grep command to verify it.

---

## Author

**Vidit Patil**
* GitHub: [@viditx](https://github.com/viditx)
* Instagram: [@notvydit](https://instagram.com/notvydit)

## License

MIT License © 2026 Vidit Patil
