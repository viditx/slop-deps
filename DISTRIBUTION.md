# Distribution & Access Policy

## Current Posture: Private Beta

`slop-deps` is currently distributed as a **private security tool**:

1. **GitHub Repository:** Private repository under `@viditx`. Access is granted to verified beta users and auditors.
2. **Binary Installer:** Windows standalone installer (`installer.exe` / `slopdeps-installer.exe`) bundled with precompiled standalone launcher (`bin/slopdeps.exe`), automatic Node runtime detection, and clean uninstaller lifecycle (`[UninstallDelete]`).
3. **GitHub Action:** Composite Action runs the vendored, checked-in CLI engine (`bin/slop-deps.js`) directly without making unauthenticated public npm network calls.
4. **npm Registry Status:** Public npm registry publication (`npm publish`) is deferred until the general public launch. Unauthenticated `npx slop-deps` calls will return 404 until public release.

## Defensive Registration

Per remediation card `F-03`, defensive registration of `slop-deps` and `slopdeps` on the public npm registry under the owner's 2FA-secured npm account is tracked as an owner action prior to lifting repository privacy.
