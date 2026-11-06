# slop-deps web client

Interactive web interface and live client-side dependency scanner for [slop-deps](https://github.com/viditx/slop-deps).

## Features

- **Client-Side Scanner**: Inspects `package.json`, `requirements.txt`, `Cargo.toml`, and `pyproject.toml` manifests directly in the browser.
- **Pure Web Verification**: Live registry checks (npm, PyPI) with rate limiting, timeouts, and standard library module bypass.
- **Bundled Popular Corpus**: Detects typosquats offline against a database of 4,000+ top open-source packages.
- **Pixel Art & Fluid Physics**: Canvas particle simulation and reactive terminal aesthetic.

## Development

```bash
npm install
npm run dev
```

## Production Build

```bash
npm run build
npm run preview
```
