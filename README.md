# slop-deps

> tera AI fake package names invent karta hai. attackers unke naam register karke wait karte hain ke koi install kar le. ye tool unhe pakadta hai — lockfile me aane se pehle.

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

seedhi baat, no bakwaas:

Cursor/Copilot/Claude — ye sab 5-21% cases me aise package names suggest karte hain jo **exist hi nahi karte**. aur ye naam repeat bhi hote hain (~43% across runs, [CSA research](https://labs.cloudsecurityalliance.org/research/csa-research-note-slopsquatting-ai-supply-chain-20260419-csa) me published). matlab attacker ke liye easy money: same phantom naam utha, npm pe register kar, malware daal, wait kar. isko **slopsquatting** bolte hain aur ye theoretical nahi hai — `react-codeshift` jaisa naam already claim ho chuka hai.

slop-deps iska seedha jawab hai: **ek command, zero setup, har import check** — source code me bhi, manifest me bhi, teeno ecosystems (npm / PyPI / crates.io).

---

## Quick Start

install bhi nahi karna padta. bas:

```bash
npx slop-deps
```

ya clone karke locally:

```bash
git clone https://github.com/viditx/slop-deps.git
cd slop-deps
npm link
slop-deps
```

10-second proof: repo ke andar `demo/` folder hai — real hallucinated imports ke saath. `npx slop-deps --dir demo` chala, red CRITICAL flags dekh.

---

## The Threat: Package Hallucination (Slopsquatting)

AI coding models (Claude, Cursor, Copilot, ChatGPT) convincing library names invent karte hain jo exist nahi karte:

```typescript
// AI agent ne hallucinate kiya:
import { formatRelativeDate } from 'date-fns-relative'; 
import { useTactileSpring } from 'react-smooth-springs';
```

donon npm pe exist nahi karte. attackers ka workflow:

1. public commits, PRs, aur AI-generated boilerplates me 404 imports crawl karo.
2. un phantom naam ko **npm** ya **PyPI** pe register karo — reverse shells, crypto stealers, env exfiltration ke saath.
3. jo bhi developer ya CI runner `npm install` / `pip install` chalaye — compromised.

`slop-deps` raw source + manifests padhta hai, har import ko live registries ke against verify karta hai — **push hone se pehle, build hone se pehle**.

---

## Verification Tiers

| Status | Risk Level | Matlab |
| :--- | :--- | :--- |
| **HALLUCINATED** | **CRITICAL** | package npm/PyPI pe exist hi nahi karta. attacker abhi register kar sakta hai. turant hatao. |
| **SUSPICIOUS** | **HIGH** | 30 din ke andar registered, ≤2 releases. ya typosquat / install-script signals. dhyan se dekho. |
| **VERIFIED** | **CLEAN** | established package, release history verified. |

---

## Core Capabilities

* **Zero Dependencies:** poora tool Node.js 18+ ke native APIs (`fetch`, `fs/promises`) pe bana hai. jo khud supply-chain check karta hai wo khud pe depend nahi karta — samajh rahe ho.
* **Typosquat Engine:** Damerau-Levenshtein + confusable-character normalization (`m0rgan` → `morgan`, `reqeusts` → `requests`) — bundled corpus ke against, **fully offline, zero network**. naya package jo kisi giant se 1 edit door hai = flag. established = sirf heads-up.
* **Install-Script Signal:** naye packages jo `preinstall`/`install`/`postinstall` ship karte hain — classic npm malware pattern — auto SUSPICIOUS.
* **File-Level AST Parsing:** imports source code me se scan hote hain (`.js`, `.ts`, `.tsx`, `.vue`, `.svelte`, `.astro`, `.py`, `.pyi`) — manifest tak pahunchne se pehle pakde jaate hain.
* **Manifest Coverage:** `package.json` (incl. `bundledDependencies`), `requirements*.txt`, `constraints.txt`, `pyproject.toml`, `setup.cfg`, `Pipfile`, `setup.py`.
* **Monorepo Aware:** internal workspace packages (`workspace:*`, `file:`, `link:`) khud detect hoke ignore — Turborepo, Nx, pnpm sab.
* **Rust / Cargo Support:** `.rs` files me `use` paths + `extern crate`, `Cargo.toml` manifests, crates.io pe live verification (hyphen/underscore name variants ke saath — rust wali quirk).
* **Smart Namespace Mapping:** python import→distribution aliases (`yaml` → `PyYAML`, `cv2` → `opencv-python`, `PIL` → `Pillow`) aur PEP 420 namespaces (`google.cloud.*`, `azure.*`, `opentelemetry.*`).
* **Noise Filtering:** stdlib built-ins, framework aliases (`$lib`, `@@/`), `tsconfig.json` path mappings — sab ignore. noise nahi, sirf signal.
* **Fail-Closed Exit Codes:** criticals pe `exit 1`, missing dir/network pe `exit 2`, clean pe `exit 0`. CI me plug karo, done.

---

## CLI Usage

```bash
# current directory scan
slop-deps

# specific directory
slop-deps --dir ./src

# pipelines ke liye raw JSON
slop-deps --json

# GitHub code scanning ke liye SARIF 2.1.0
slop-deps --sarif > slop-deps.sarif

# sirf git-staged files (pre-commit hook)
slop-deps --staged

# offline scan — persistent cache + bundled corpus, zero network
slop-deps --offline

# typosquat corpus ko live registries se refresh karo
slop-deps --update-corpus

# BYOK AI se hallucinated imports fix karwao (backups: *.slop-deps.bak)
SLOP_AI_KEY=sk-... npx slop-deps --fix

# local model pe point karo — kuch bhi machine se bahar nahi jata
SLOP_AI_BASE_URL=http://127.0.0.1:11434/v1 npx slop-deps --fix

# network verification incomplete ho toh fail karo
slop-deps --strict

# options
slop-deps --help
```

## Privacy

**No telemetry. No accounts. No data collection.** scan ka ek hi network traffic hota hai — package names ke GET lookups against registry.npmjs.org aur pypi.org (wahi requests jo koi bhi package manager bhejta hai). full breakdown [PRIVACY.md](PRIVACY.md) me — "trust me" nahi, `grep -rn "fetch(" src/` se khud verify karo. full control ke 2 commands:

```bash
npx slop-deps --private   # zero-network scan: bundled corpus + local cache only
npx slop-deps --clear-cache   # local verdict cache wipe
```

### Project config (`.slopdepsrc.json`)

private toolchains aur monorepos apni duniya sikha sakte hain — fork ki zaroorat nahi:

```json
{
  "builtins": { "npm": ["acme-internal-sdk"], "pypi": ["acme_lib"] },
  "popular": { "npm": ["acme-enterprise-suite"] },
  "map": { "my_custom_import": "my-custom-dist" }
}
```

- `builtins` — registries pe verify hi nahi honge (internal packages)
- `popular` — typosquat corpus me add (apne org ke flagship naam protect karo)
- `map` — custom import-name → distribution-name mappings

### Self-updating corpus

typosquat engine **3,000+ npm aur 1,000+ PyPI names** pe chalta hai — curated entries + registry-generated list (`src/corpus.generated.js`) merged. `slop-deps --update-corpus` (ya monthly CI job) se regenerate — corpus kabhi rot nahi hota.

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

PR me hallucinated imports aaye toh automatically block:

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

> agar cheez zyada lagti hai, toh wo fake hai.

scanner khud wahi standard follow karta hai jo wo dusron me pakadta hai: zero dependencies, zero install scripts, zero telemetry, read-only filesystem. [PRIVACY.md](PRIVACY.md) me har claim grep-command ke saath verify karne ko bola gaya hai.

---

## Author

**Vidit Patil**
* GitHub: [@viditx](https://github.com/viditx)
* Instagram: [@notvydit](https://instagram.com/notvydit)

## License

MIT License © 2026 Vidit Patil
