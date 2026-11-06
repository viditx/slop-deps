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
**GET** request against the relevant public registry:

- `https://registry.npmjs.org/<name>` (npm)
- `https://pypi.org/pypi/<name>/json` (PyPI)
- `https://crates.io/api/v1/crates/<name>` (crates.io, when Rust files/manifests are present)

No POSTs. No authorization headers or user authentication. Standard `Accept`
headers are sent to npm/PyPI; crates.io requests include a descriptive `User-Agent`
(`slop-deps/<version>`) as required by the crates.io API policy. No identifiers,
tokens, or machine fingerprints are sent: just the package name in the URL path,
the same request any package manager makes. Nothing else is contacted: no CDN, no
analytics domain, no update server.

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

You don't have to trust this document. The codebase is ~1,600 lines of
dependency-free JavaScript:

```bash
# every network call in the project
grep -rn "fetch(" src/
# every outbound host
grep -rhn "https://" src/ | grep -o 'https://[^/`"]*'
```

The test suite (`npm test`) asserts the network surface stays this small.
