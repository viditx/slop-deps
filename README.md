# slop-deps

> Zero-dependency scanner for detecting AI-hallucinated and typosquatted dependencies before attackers weaponize them.

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
   AI Dependency Hallucination & Supply-Chain Sentinel • v1.0.0
```

---

## Quick Start

Run directly via `npx` (zero install):

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

---

## The Threat: Package Hallucination (Slopsquatting)

AI coding models (Claude, Cursor, Copilot, ChatGPT) frequently invent convincing library names:

```typescript
// Hallucinated by AI agent:
import { formatRelativeDate } from 'date-fns-relative'; 
import { useTactileSpring } from 'react-smooth-springs';
```

Neither package exists on npm. Attackers actively exploit this workflow:

1. Crawl public commits, PRs, and AI-generated boilerplates for 404 imports.
2. Register those phantom names on **npm** or **PyPI** with malicious payloads (reverse shells, crypto stealers, environment exfiltration).
3. Any developer or CI runner executing `npm install` or `pip install` subsequently gets compromised.

`slop-deps` inspects raw source code and manifests, verifying every import against live registries **before** code is pushed or built.

---

## Verification Tiers

| Status | Risk Level | Description |
| :--- | :--- | :--- |
| **HALLUCINATED** | **CRITICAL** | Package does not exist on npm or PyPI. Attackers can register it immediately. |
| **SUSPICIOUS** | **HIGH** | Package was registered within the last 30 days with ≤2 releases. High risk of newly deployed lure. |
| **VERIFIED** | **CLEAN** | Established package with verified release history. |

---

## Core Capabilities

* **Zero Dependencies:** Built entirely on Node.js 18+ native APIs (`fetch`, `fs/promises`). No dependency bloat.
* **File-Level AST Parsing:** Scans imports inside source code (`.js`, `.ts`, `.tsx`, `.vue`, `.svelte`, `.astro`, `.py`, `.pyi`) before they even reach manifest files.
* **Manifest Coverage:** Supports `package.json`, `requirements*.txt`, `pyproject.toml`, `setup.cfg`, `Pipfile`, and `setup.py`.
* **Monorepo Aware:** Automatically detects and ignores internal workspace packages (`workspace:*`, `file:`, `link:`) in Turborepo, Nx, and pnpm setups.
* **Smart Namespace Mapping:** Maps top Python import-to-distribution aliases (`yaml` → `PyYAML`, `cv2` → `opencv-python`, `PIL` → `Pillow`) and PEP 420 namespaces (`google.cloud.*`, `azure.*`).
* **Noise Filtering:** Disregards standard library built-ins, framework aliases (`$lib`, `@@/`), and `tsconfig.json` path mappings.
* **Fail-Closed Exit Codes:** Returns `exit 1` on critical hallucinations, `exit 2` on missing directories or network errors, and `exit 0` on clean verification.

---

## CLI Usage

```bash
# Scan current directory
slop-deps

# Scan a specific directory
slop-deps --dir ./src

# Emit raw JSON for pipelines
slop-deps --json

# Fail if network verification is incomplete
slop-deps --strict

# Display options
slop-deps --help
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

## Author

**Vidit Patil**
* GitHub: [@viditx](https://github.com/viditx)
* Instagram: [@notvydit](https://instagram.com/notvydit)

## License

MIT License © 2026 Vidit Patil
