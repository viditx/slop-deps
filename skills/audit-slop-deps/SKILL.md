---
name: audit-slop-deps
description: >
  Scans project source files, git repos, and manifests for AI-hallucinated or typosquatted dependencies before they reach your lockfile. Use whenever the user writes code, installs packages, adds dependencies, generates imports in python or javascript files, asks to audit packages, or runs pre-commit checks on package.json, requirements.txt, or Cargo.toml - even if they never say "slop" or "hallucination". Do not use for general syntax linting (that is eslint or ruff) or code formatting (that is prettier or black).
---

# Audit Slop Dependencies

## Purpose

AI coding models (Claude, Cursor, Copilot, ChatGPT) routinely invent package names that do not exist on package registries. Attackers register these hallucinated names to execute supply-chain attacks when developers run `npm install`, `pip install`, or `cargo build`.

Following this skill beats improvising because it runs zero-dependency upstream registry verification (npm, PyPI, Crates.io) and typosquat heuristics with sub-second execution, catching unverified or malicious packages before they enter lockfiles.

## Inputs

- **Manifests:** `package.json`, `requirements.txt`, `pyproject.toml`, `setup.cfg`, `Pipfile`, `setup.py`, `Cargo.toml`.
- **Source code:** `.js`, `.mjs`, `.cjs`, `.ts`, `.tsx`, `.jsx`, `.py`, `.pyi`, `.rs`.
- **Working directories:** Repository roots, staged git files, or monorepo subfolders.

## Workflow

1. **Detect context:** Identify whether you are in a git repository or specific subfolder.
2. **Execute scan:**
   - For working repository scan:
     ```bash
     slopdeps
     ```
   - For a specific directory or monorepo package:
     ```bash
     slopdeps <path-to-folder>
     ```
   - For pre-commit / staged files only:
     ```bash
     slopdeps --staged
     ```
   - For air-gapped / offline verification (uses local corpus & cache):
     ```bash
     slopdeps --offline
     ```
   - For machine-readable CI/CD pipelines:
     ```bash
     slopdeps --json
     slopdeps --sarif
     ```
3. **Parse findings:**
   - Look for `error: package '<pkg>' does not exist on <registry>`.
   - Look for `warning: <pkg> looks like typosquat of '<legit-pkg>'`.
4. **Remediate:**
   - If findings exist: Remove hallucinated imports or substitute verified canonical packages.
   - If user has BYOK configured (`SLOP_AI_KEY`): Run `slopdeps --fix` to generate automatic clean import replacements with `.slop-deps.bak` backups.

## Output format

When reporting results to the user, always use compiler-style diagnostics:

```text
slop-deps v1.4.0

  src/services/auth.ts:12
    error: package 'express-jwt-magic-v2' does not exist on npm

  scripts/process.py:4
    error: package 'reqeusts' does not exist on pypi

  2 errors (14 packages checked)
```

## Examples

**Example 1 — Standard project scan:**
```bash
slopdeps ./frontend
```
Output:
```text
slop-deps v1.4.0

  ✔ All 42 packages verified on registry.
```

**Example 2 — Hallucinated package caught in pre-commit:**
```bash
slopdeps --staged
```
Output:
```text
slop-deps v1.4.0

  components/Header.tsx:3
    error: package 'react-magic-springs-ai' does not exist on npm

  1 error (1 package checked)
```

## Edge cases

- **Bare run in User Home / Drive root:** Running `slopdeps` in `C:\Users\<user>` or `/` safely stops immediately and prompts for a project path without traversing user directories or caches.
- **Monorepo workspaces & internal aliases:** Local workspace packages declared in root `package.json` or path mappings in `tsconfig.json` (`@/...`, `~/...`) are automatically detected and exempt from remote registry queries.
- **Python namespace packages & OS builtins:** Windows builtins (`winreg`, `nt`), standard library modules, and PEP 420 namespace packages (`google.auth`, `azure.core`) are resolved against canonical distributions without false alarms.

## Bundled files

- `bin/slop-deps.js` — The standalone executable Node.js CLI engine.
- `installer.iss` — Inno Setup 6 script compiling the interactive Windows installer with real-time command collision detection.
