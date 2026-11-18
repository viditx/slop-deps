# Privacy: slop-deps

slop-deps is a security tool, so it holds itself to the standard it audits in
others. Here is exactly what touches your machine and your network. Nothing is
hidden behind settings you didn't know about.

## The short version

**slop-deps has no telemetry, no analytics, no version phone-home, no accounts,
and no data collection of any kind.** It is a zero-dependency static scanner.
The npm tarball contains code and one bundled data file: nothing else.

## What stays on your machine

- Every file slop-deps reads (your source, manifests) is read locally and never
  leaves your machine. Results are printed directly to your terminal (stdout/JSON/SARIF).
  The CLI runs purely headless with zero network listening sockets or background daemons.
- The optional verdict cache lives in one local file in your user cache directory
  (`%LOCALAPPDATA%\slop-deps\cache.json` on Windows, `~/.cache/slop-deps/cache.json`
  or `$XDG_CACHE_HOME/slop-deps/cache.json` on Linux/macOS). It stores package names and
  registry verdicts so repeated scans are instant. Wipe it any time:

  ```bash
  npx slop-deps --clear-cache
  ```

## What touches the network (and why)

In a normal scan, each *unrecognized* package name is checked with a single
**GET** request against the relevant public registry. All outbound endpoints,
protocols, ports, payloads, and triggers are documented below:

| Host | Protocol / Port | Method | Payload / Request Data | Purpose | When Called |
|:---|:---:|:---:|:---|:---|:---|
| `registry.npmjs.org` | HTTPS / 443 | GET | Package name in URL path | Fetch npm package metadata & verify existence | Normal scan when unverified npm package detected |
| `pypi.org` | HTTPS / 443 | GET | Package name in URL path | Fetch PyPI package JSON metadata & verify existence | Normal scan when unverified Python/pip package detected |
| `crates.io` | HTTPS / 443 | GET | Crate name in URL path | Fetch crates.io API metadata (`User-Agent: slop-deps/<version>`) | Normal scan when unverified Rust/Cargo dependency detected |
| `repo1.maven.org` | HTTPS / 443 | GET | Group & Artifact ID path (`maven-metadata.xml`) | Verify package existence on Maven Central | Normal scan when unverified Kotlin/Java/Gradle dependency detected |
| `dl.google.com` | HTTPS / 443 | GET | Group & Artifact ID path (`maven-metadata.xml`) | Verify package existence on Google Maven | Normal scan when unverified Android dependency detected |
| `plugins.gradle.org` | HTTPS / 443 | GET | Plugin/Artifact ID path (`maven-metadata.xml`) | Verify package existence on Gradle Plugin Portal | Normal scan when unverified Gradle plugin detected |
| `raw.githubusercontent.com` | HTTPS / 443 | GET | None | Download top-30-days PyPI dataset | **Only** when running `--update-corpus` explicitly |
| `registry.npmjs.org` (search) | HTTPS / 443 | GET | Query seeds in URL params | Query high-popularity packages for bundled corpus | **Only** when running `--update-corpus` explicitly |
| `api.openai.com` / `api.anthropic.com` / local (e.g. `127.0.0.1:11434`) | HTTPS / 443 (or local HTTP) | POST | Flagged import line & diagnostic context | AI-assisted replacement suggestion | **Only** when `--fix` is explicitly invoked with user-supplied API key |

No POSTs occur in standard scanning. No authorization headers, tokens, tracking cookies, machine fingerprints, or analytics are ever sent. Standard `Accept` and `User-Agent` headers are transmitted as required by public registry rate-limiting and identification policies. Nothing else is contacted: no telemetry service, no third-party CDNs, and no background phone-home daemons.

If even that is too much for your environment, privacy mode makes no network
calls at all:

```bash
npx slop-deps --offline   # alias: --private
```

Offline mode verifies popular packages against the bundled popularity corpus
(3,000+ npm, 1,000+ PyPI names shipped inside the package), replays past
verdicts from the local cache, and marks anything it cannot honestly verify as
`UNKNOWN`. It will never fake a clean bill of health.

## AI fix mode (`--fix`) is opt-in and BYOK

`--fix` is the only feature that sends source content anywhere beyond public
registry endpoints, and it only runs when you explicitly pass the flag and set
your own key. It sends the flagged import lines to whatever endpoint you
configure, including a local model on `127.0.0.1` (Ollama, llama.cpp), in which
case nothing leaves your machine at all. It writes only to the flagged files
plus `.slop-deps.bak` backups.

## What slop-deps will never do

- No telemetry or crash reporting
- No account, signup, or API keys
- No writing outside its local cache file (and opt-in `--fix` backups)
- No code execution from scanned packages: files are parsed as text, never run
- No install scripts of its own (the exact risk signal it flags in others)

## Verifying these claims

You don't have to trust this document. The codebase is ~3,180 lines of
dependency-free JavaScript:

```bash
# every network call in the project
grep -rn "fetch(" src/
# every outbound host
grep -rhn "https://" src/ | grep -o 'https://[^/`"]*'
```

The test suite (`npm test`) asserts the network surface stays this small.
