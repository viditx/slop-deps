# Distribution & Access Policy

## Current Posture: Public Alpha (v1.0.0-alpha)

`slop-deps` is officially available across all primary distribution channels:

1. **npm Registry (Public):** Published under [@viditx](https://www.npmjs.com/~viditx) at [npmjs.com/package/slop-deps](https://www.npmjs.com/package/slop-deps). Run instantly with zero installation via:
   ```bash
   npx slop-deps
   # or install globally
   npm install -g slop-deps
   ```
2. **GitHub Repository (Public):** Open source under MIT license at [github.com/viditx/slop-deps](https://github.com/viditx/slop-deps).
3. **Binary Installer:** Windows standalone installer (`slopdeps-installer.exe`) bundled with precompiled standalone launcher (`bin/slopdeps.exe`), automatic Node runtime detection, and clean uninstaller lifecycle (`[UninstallDelete]`).
4. **GitHub Action:** Available for CI pipelines (`viditx/slop-deps@main`).

## Defensive Protection

Per remediation card `F-03`, `slop-deps` is secured under `@viditx` on npmjs.org. The variant name `slopdeps` is automatically protected by npm's native typosquatting protection against similar package collision.
