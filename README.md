# slop-deps

> **Architected by a 16-year-old. Engineered by AI.**  
> Catch hallucinated, non-existent npm, PyPI, and Crates.io packages *before* you run `install` and get owned.

**Web Scanner:** [slop-deps.pages.dev](https://slop-deps.pages.dev/) &middot; **npm:** [`npm install -g slop-deps`](https://www.npmjs.com/package/slop-deps)

```bash
# Instant scan, zero install
npx slop-deps

# Or install globally
npm install -g slop-deps
slopdeps
```

Windows standalone binary `slopdeps-installer.exe` is also available on [Releases](https://github.com/viditx/slop-deps/releases).

[![npm version](https://img.shields.io/npm/v/slop-deps?color=cb3837)](https://www.npmjs.com/package/slop-deps)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![Dependencies: Zero](https://img.shields.io/badge/Dependencies-0-success.svg)](package.json)
[![Tests: 79 Passing](https://img.shields.io/badge/Tests-79%2F79%20PASS-brightgreen.svg)](test/run-tests.js)
[![Node.js: >=18](https://img.shields.io/badge/Node.js-%3E%3D18-brightgreen.svg)](https://nodejs.org)

```text
$ slopdeps

  CRITICAL  fake-jwt-decoder-super-auth-xyz (npm)
            src/auth/jwt.ts:4
            Package DOES NOT EXIST on npm. Potential AI hallucination trap!
            Did you mean 'jsonwebtoken'?

  WARN      reqeusts (pypi)
            services/api.py:12
            Typosquat risk: 1 edit from 'requests'.

  Summary: 2 flagged (1 CRITICAL, 1 WARN), 140 clean. 
  Elapsed: 142ms. Zero dependencies. Fail-closed exit.
```

---

## Why This Exists

AI coding assistants (Claude, Cursor, Copilot) invent package names that don't exist on public registries. Attackers crawl GitHub for these 404 imports, register the exact hallucinated package on npm/PyPI with a malicious `preinstall` payload, and wait.

The moment you run `npm install` or `pip install`:
1. Package manager executes lifecycle scripts (`preinstall`, `setup.py`) before compilers or linters touch the code.
2. The payload runs in your shell, exfiltrating `.env` secrets or SSH keys.
3. Traditional tools (`npm audit`, Snyk) only inspect dependencies *after* install scripts have already executed.

`slop-deps` statically scans raw source files (`.js`, `.ts`, `.py`, `.rs`) and manifests to catch hallucinations *before* anything touches your disk or package manager.

---

## How It Works

- **Static Lexer:** Zero-dependency lexical parser for JS/TS, Python, Rust, and manifests. Handles dynamic imports, static concatenation (`'a' + 'b'`), and type-only imports without compiler overhead.
- **Bundled Popularity Corpus:** 4,179 ecosystem packages verified offline in sub-millisecond time with zero telemetry.
- **Upstream Registry Probes:** Direct HTTPS HEAD checks to `npmjs.org`, `pypi.org`, and `crates.io` with local TTL disk caching.
- **Offline Typosquat Engine:** Damerau-Levenshtein and homoglyph detection for lookalike attacks targeting popular dependencies (`reqeusts` -> `requests`).
- **Private Scope Discovery:** Auto-detects internal enterprise packages from `.npmrc` and root `package.json` to prevent false alarms on internal monorepo code.

---

## CLI Reference

```bash
# Scan current repository
slopdeps

# Scan only git-staged files (fast pre-commit)
slopdeps --staged

# Air-gapped mode (bundled corpus + cache only, zero network)
slopdeps --offline

# AI auto-repair with secondary hallucination guard (BYOK)
slopdeps --fix

# CI/CD integration
slopdeps --json
slopdeps --sarif > results.sarif
slopdeps --strict
```

| Flag | Purpose |
|:---|:---|
| `-d, --dir <path>` | Target directory to scan (default: cwd). |
| `--staged` | Pre-commit mode: only scans git-staged files. |
| `--offline` | Air-gapped verification via local corpus + cache (zero network calls). |
| `--fix` | AI-assisted import repair with atomic `.bak` backups and safety guards. |
| `--strict` | Fail-closed gate: exit code 2 on warnings, critical findings, or errors. |
| `--json / --sarif` | Machine-readable outputs for GitHub Code Scanning and CI pipelines. |

---

## How This Was Built

**Architected by me (16yo), engineered with AI agents over weeks of relentless audit cycles.**

- Enforced pure Node.js standard library with zero external runtime packages.
- Built an automated 79-test deterministic regression suite (all green).
- Ran 3 rounds of red-team security audits to hunt down parser blindspots and TOML escapes.
- Native Inno Setup 6 installer with verified PE resource headers.

---

## My note (written by me)

hey there, this is vidit i like typing too much so the actual story behind this was one day i was working on my assignments then i saw my ai agent antigravity idle and i was like u lazy shit build something for me he said tell me what to build i got  frustrated by him after all tho 
then i went to zcode devday offer which i claimed i used it for the first time and then showed the code to antigravity antigravity showed brooo fake packages. then i ran antigravity and said broo i need solution for this and then i named it slop deps( ai slop dependencies) then i made this in 2 weeks yes 2 weeks i went to claude he told me 4.5/10 and then i went to z.ai yes the one who is best in cybersecurity i guess. he checked fixed it and done. i know this is not an actual product to be sold i might launch a skill to stop the hallucinated packages so be ready give me ratings here  

👉 **[Rate slop-deps & Drop Feedback](https://slop-deps.pages.dev/feedback.html)**

---

## License

MIT © [Vidit Patil](https://github.com/viditx)

*Made for devs who code at 2 AM with AI agents. Good luck with your hallucinated packages.*
