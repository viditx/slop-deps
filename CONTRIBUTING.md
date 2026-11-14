# Contributing to slop-deps

Thanks for helping make dependency supply-chain checks safer.

## Development setup

The CLI has no runtime dependencies. Use Node.js 18 or newer:

```bash
npm test
```

The website has its own package manifest:

```bash
npm ci --prefix site/morpho
npm run lint --prefix site/morpho
npm run build --prefix site/morpho
```

## Pull requests

- Keep changes focused and preserve the zero-runtime-dependency design.
- Add or update a regression test for behavior changes.
- Run `npm test` and the relevant website checks before opening a PR.
- Do not commit generated build output, local caches, credentials, or personal environment files.
- Explain security-sensitive behavior and any network access changes clearly.

## Reporting issues

Use the issue templates for bugs and feature requests. Do not include secrets,
private source code, or unredacted registry responses in an issue.
