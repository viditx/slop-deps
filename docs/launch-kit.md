# slop-deps Launch Kit — attention plan + ready-to-post drafts

> Internal doc. Strategy pehle, drafts baad me. Sab drafts English me hain (audience
> global), tone: no marketing slop, numbers-first, instantly testable.

## The Hook (ye sab kuch hai)

Numbers jo already researched/published hain — inhi pe poora marketing khada hai:

- **21%+** — coding models kitni baar package names hallucinate karte hain (EndorLabs/Trend data)
- **43%** — hallucinated names ACROSS RUNS repeat hote hain (Cloud Security Alliance, Apr 2026) — matlab attackers ko same phantom names mil jaate hain, harvesting trivial hai
- **react-codeshift** — real registered hallucination (Aikido, Feb 2026). hamara 10-second demo isi pe based hai. **UPDATE Oct 2026: wo name ab ACTUALLY REGISTERED hai on npm (verified HTTP 200)** — launch posts me ye line gold hai: "the exact hallucinated name from Aikido's writeup is now claimed on npm. this is not theoretical."
- Axios npm compromise (Mar 2026), TanStack/Mistral campaign (170+ packages) — "ye theoretical nahi hai" proofs
- demo/ folder ke saare names live-verified unregistered hain (404) — refresh kar lena launch se pehle

One-liner jo har jagah use hoga:

> Your AI writes fake package names. Attackers register them. slop-deps catches
> them in one `npx` — before they reach your lockfile.

## ⚡ BLACK OCTOBER WINDOW (live abhi — Oct 2026)

Ye wo moment hai jiska launch kit me "news-jacking" likha tha — aur wo AA GAYA hai.

**Kya chal raha hai** (Oct 19-23 peak, Guardian/CNBC/Axios/Vox sab cover kar rahe hain):
- **npm wave (Oct 5-21)**: @subql/common (trusted-publishing workflow swap, creds stealer + remote shell), Tensorlake (CI pipeline compromise, Shai-Hulud variant with dead-man's switch), hundreds of packages
- **LiteLLM (PyPI, Oct 21)**: account hijack via stolen GitHub CLI tokens, payload Python startup hooks se — "import bhi na ho to bhi chalta hai", browser/cloud/AI creds + RAT
- **GhostAction**: ~790+ repos tak stolen PATs se malicious workflows
- **PHP2Shell**: critical PHP RCEs jo AI se DISCOVER hui — FBI/NSA warnings, "most serious 48 hours in cybersecurity history"
- Saath me: eMudhra CA incident, Notepad++ update infra hijack, SBI exposure

**AI angle (ye hamara lane hai)**: saare stealers AI tool configs/keys target kar rahe hain, PHP bugs AI ne dhundhi, aur poora narrative "AI-enabled hacking era" hai. AI-generated code trust crisis = slopsquatting ka exact context.

**HONEST tie-in (important — false claims mat karo)**: Black October ke npm incidents COMPROMISED LEGIT PACKAGES the (workflow/account hijack) — slop-deps ye class NAHI pakadta (wo pinned versions + provenance ka kaam hai). Jo pakadta hai: hallucinated/typosquat traps + young+install-script signals — same ecosystem, same fear, alag attack class. Launch post ka honest frame:

> "Black October has everyone staring at their dependency lists. If you're auditing yours: slop-deps is a 10-second source-level check for the phantom-package class (names that shouldn't exist at all), pair it with lockfile pinning + provenance for the compromise class."

**Action**: launch window abhi ka best hai — attention supply-chain pe peak pe hai. Show HN first comment me Black October ka mention + ye honest scoping. Agar 1-2 hafte wait kiya to wave guzar jayegi.

## Phase 1 — Pre-launch assets (launch se 1-2 din pehle)

1. **Demo GIF/asciinema** README ke top pe: terminal me `npx slop-deps` chalate hue,
   red CRITICAL flags aate hue. Record: `asciinema rec` ya Windows pe
   `screen-to-gif`. 15-20 sec max.
2. **Social preview banner** — `web/social-preview.html` (1280x640, GitHub og:image).
   Screenshot karke repo Settings → Social preview.
3. **The stunt file** repo me: `demo/hallucinated-app.ts` —
   `import { codemod } from 'react-codeshift'` + 2-3 aur real hallucinated names.
   README me: "try it: `npx slop-deps --dir demo`". Ye INSTANT proof hai — koi
   setup nahi, 10 second me CRITICAL dikh jata hai.
4. GitHub topics set karo: `security`, `supply-chain`, `slopsquatting`, `npm`,
   `pypi`, `typosquatting`, `ai-safety`, `static-analysis`, `zero-dependencies`.
5. Repo description: `Zero-dependency sentinel against slopsquatting — catches
   AI-hallucinated & typosquatted npm/PyPI packages before they reach your lockfile.`

## Phase 2 — Launch day (Tuesday ya Wednesday, US morning ~8-10am ET)

### Show HN (primary)

Title: `Show HN: Slop-deps – catch AI-hallucinated packages before attackers register them`

First comment (post karte hi lagao — ye sabse important cheez hai):

> I built this because AI coding assistants keep inventing package names — the Cloud
> Security Alliance found ~43% of hallucinated names repeat across model runs, so
> attackers can harvest the same phantom names and wait for someone to `npm install`
> them. It already happened with `react-codeshift` (Aikido wrote it up in Feb).
>
> slop-deps scans your SOURCE imports (not just lockfiles — hallucinations die before
> they ever reach a manifest), verifies every name against npm/PyPI, flags typosquats
> (Damerau-Levenshtein + confusable chars: `m0rgan` vs `morgan`), and escalates young
> packages that ship install scripts. Zero dependencies, works on Node 18+, exits
> non-zero for CI:
>
>     npx slop-deps
>
> There's a `demo/` folder in the repo with real hallucinated names — point it there
> and you'll see CRITICAL flags in ~10 seconds. Happy to answer anything about the
> detection heuristics or false-positive handling.

Rules: marketing-speak zero, har criticism ka seedha jawab, 24-48ghante active raho.

### Reddit (HN ke 1-2 ghante baad, alag angle per subreddit)

r/netsec (technical angle):
> **Tool: slop-deps — offline typosquat engine + registry verification for AI-hallucinated deps (0-dependency, MIT)**
> CSA's Apr 2026 note showed 43% of hallucinated package names recur across model
> runs. I open-sourced a scanner that checks source-level imports against npm/PyPI,
> runs Damerau-Levenshtein + confusable-character normalization against a bundled
> popular-package corpus (fully offline), and flags young packages with install
> scripts. SARIF output for code scanning, --staged mode for pre-commit.
> Looking for feedback on the FP/FN tradeoffs in the age-gating heuristic.

r/node + r/javascript (developer angle):
> My AI assistant keeps inventing packages that don't exist — so I made a scanner
> that catches them. Zero deps, `npx slop-deps`, non-zero exit for CI. Also catches
> typosquats (`lodaeh` → "did you mean lodash?").

### X/Twitter thread (5 tweets, launch day)

1. AI models hallucinate package names 21%+ of the time. 43% of those names REPEAT
   across runs. Attackers noticed. 🧵
2. It already happened: `react-codeshift` — a name models invent — got registered.
   Anyone who installed it got malware'd. This is "slopsquatting".
3. So I built slop-deps: scans your SOURCE (not just lockfiles), verifies every
   import against npm/PyPI, catches typosquats offline (m0rgan ≠ morgan), flags
   young packages with install scripts.
4. Zero dependencies. One command: `npx slop-deps`. SARIF for GitHub, --staged for
   pre-commit, exit codes for CI. MIT, 48 tests.
5. Try the 10-second demo: clone, `npx slop-deps --dir demo` — watch real
> hallucinated names light up red. github.com/viditx/slop-deps

(har tweet pe terminal screenshot/GIF)

### dev.to article (launch +2-3 din, evergreen SEO)

Title: "Slopsquatting is real: I scanned AI-generated code for fake packages — here's what I found"
- Structure: incident recap (react-codeshift, TanStack) → 21%/43% numbers → "so I
  built a scanner" → GIF demo → detection heuristics explained (typosquat engine,
  install-script signal) → CI/pre-commit setup snippets → results from scanning
  real AI-generated projects (YE SECTION KHAIL HAI — khud scan karke real numbers
  daalna, tabhi article credible hai)

## Phase 3 — Momentum (launch week +)

1. **Awesome-lists PRs**: awesome-security, awesome-supply-chain, awesome-ai-tools —
   one-line addition + GIF link. Low effort, permanent distribution.
2. **News-jacking**: jab bhi next npm/PyPI supply-chain incident aaye ( ArrayAdapter
   pattern: har mahine ek aata hai), 24 ghante me X/LinkedIn pe "how slop-deps
   would've caught this" + incident-specific demo.
3. **Issues-first SEO**: GitHub discussions me FAQ answers — "how to detect
  hallucinated packages", "slopsquatting check" — ye queries Google se aayenge.
4. **The scan stunt**: 50-100 public AI-generated repos scan karke ek findings
   summary publish karo (no names shaming, sirf aggregate stats). Press bait:
   "X% of Cursor-generated projects contained hallucinated deps".
5. Weekly HN/Reddit "releases" jab feature drop ho (SARIF, UI, staged mode abhi
   bacha hai launch ke baad ke liye bhi).

## Metrics (kya track karna)

- npm weekly downloads (npmjs.com/package/slop-deps)
- GitHub stars trajectory (launch day target: 100+ realistic for this niche)
- Show HN points + comments (front page = ~50k visitors potential)
- npx run rate, clone count

## Do's / Don'ts

- DO: first comment story, GIF demo, 43% number har jagah, FP-handling honesty
- DON'T: "revolutionary/game-changing" vocabulary, fake urgency, beta-tag launch,
  ek hi din me sab platforms pe spam (HN → 2h gap → Reddit → next day X thread)
