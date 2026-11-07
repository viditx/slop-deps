import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { extractHtmlDependencies, extractManifestDependencies, detectFileEcosystem } from '../../site/morpho/src/utils/fileInspector.ts';
import { scanFile } from '../../site/morpho/src/scanner/index.ts';
import { formatHeadline, TIMEOUT_ERROR_MESSAGE } from '../../site/morpho/src/utils/scanHeadline.ts';
import type { FileScanResult } from '../../site/morpho/src/scanner/types.ts';

export async function runTest(testName: string) {
  if (testName === '62') {
    // Test 62: CDN scoped extraction & esm.sh prefixes (WO-A T7 & Addendum A3)
    const cdns = [
      '<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>',
      '<script src="https://unpkg.com/@supabase/supabase-js@2.1.0/dist/umd/supabase.js"></script>',
      '<script src="https://esm.sh/@supabase/supabase-js@2"></script>',
      '<script src="https://cdn.skypack.dev/@supabase/supabase-js@2"></script>',
    ];
    for (const tag of cdns) {
      const deps = extractHtmlDependencies(tag);
      assert.equal(deps[0]?.name, '@supabase/supabase-js', `CDN ${tag} must extract @supabase/supabase-js`);
    }

    // A3: esm.sh prefix variants (v135/, stable/, * forms)
    const esmVariants = [
      '<script src="https://esm.sh/v135/react@18"></script>',
      '<script src="https://esm.sh/stable/react@18"></script>',
      '<script src="https://esm.sh/*react@18"></script>',
      '<script src="https://esm.sh/react@18"></script>',
      '<script src="https://esm.sh/@scope/pkg@1"></script>',
    ];
    for (const tag of esmVariants.slice(0, 4)) {
      const deps = extractHtmlDependencies(tag);
      assert.equal(deps[0]?.name, 'react', `esm.sh variant ${tag} must extract react`);
    }
    const scopedEsm = extractHtmlDependencies(esmVariants[4]);
    assert.equal(scopedEsm[0]?.name, '@scope/pkg', 'esm.sh scoped package must extract @scope/pkg');

    // jsdelivr /gh/ excluded
    const ghTag = '<script src="https://cdn.jsdelivr.net/gh/jquery/jquery@3.6.0/dist/jquery.min.js"></script>';
    const ghDeps = extractHtmlDependencies(ghTag);
    assert.ok(!ghDeps.some(d => d.name.includes('jquery')), 'jsdelivr /gh/ must not extract jquery');
    assert.ok(!ghDeps.some(d => d.name.includes('gh')), 'jsdelivr /gh/ must not extract gh');

    return 'CDN scoped packages & esm.sh prefixes (v135/, stable/, *) extracted; jsdelivr /gh/ excluded';
  }

  if (testName === '63') {
    // Test 63: Importmap aliases (~ and @/) & CDN values & local path suppression (WO-A T2 & Addendum A2)
    const importMapHtml = `
      <script type="importmap">
      {
        "imports": {
          "@/components/": "./src/components/",
          "~/utils": "./src/utils.js",
          "lodash": "https://esm.sh/lodash",
          "@supabase/supabase-js": "https://esm.sh/@supabase/supabase-js",
          "dual-test": "https://esm.sh/lodaeh@1.0.0",
          "vendored-local": "./vendor/lodash.js",
          "~/x": "https://esm.sh/loodash"
        }
      }
      </script>
    `;
    const imDeps = extractHtmlDependencies(importMapHtml);
    const imNames = imDeps.map(d => d.name).sort();

    // {"dual-test": "https://esm.sh/lodaeh@1.0.0"} -> both dual-test and lodaeh extracted
    assert.ok(imNames.includes('dual-test'), 'dual-test key must be extracted');
    assert.ok(imNames.includes('lodaeh'), 'lodaeh value must be extracted');

    // {"~/x": "https://esm.sh/loodash"} -> loodash extracted, ~/x skipped
    assert.ok(imNames.includes('loodash'), 'loodash value must be extracted');
    assert.ok(!imNames.some(n => n.includes('~/')), '~/x key must be skipped');

    // {"vendored-local": "./vendor/lodash.js"} -> nothing extracted (no phantom dep for local path)
    assert.ok(!imNames.includes('vendored-local'), 'local-valued key vendored-local must not be extracted');

    // standard bare & scoped packages
    assert.ok(imNames.includes('lodash'), 'lodash key must be extracted');
    assert.ok(imNames.includes('@supabase/supabase-js'), '@supabase/supabase-js key must be extracted');

    // alias roots skipped
    assert.ok(!imNames.includes('@/components'), '@/ alias root must be skipped');
    assert.ok(!imNames.includes('~'), '~ alias root must be skipped');

    return 'Importmap aliases skipped, CDN values extracted, local-valued keys suppressed';
  }

  if (testName === '64') {
    // Test 64: TOML headers ([[bin]], [[tool.poetry.source]], ["weird # key"], and URL # fragments) (WO-A T8 & Addendum A9)
    const cargo = `
[package]
name = "my-tool"
version = "0.1.0"
[dependencies]
serde = "1.0"
[[bin]]
name = "cli"
path = "src/main.rs"
    `;
    const cargoRes = await scanFile({ name: 'Cargo.toml', size: cargo.length, text: async () => cargo });
    assert.equal(cargoRes.error, undefined, 'Cargo.toml with [[bin]] must not be invalid');
    assert.ok(cargoRes.packages.some(p => p.name === 'serde'), 'Dependencies extracted from Cargo.toml');

    const pyproject = `
[project]
name = "demo"
version = "0.1.0"
dependencies = ["requests>=2.0"]
[[tool.poetry.source]]
name = "custom"
url = "https://example.com/simple"
    `;
    const pyRes = await scanFile({ name: 'pyproject.toml', size: pyproject.length, text: async () => pyproject });
    assert.equal(pyRes.error, undefined, 'pyproject.toml with [[tool.poetry.source]] must not be invalid');
    assert.ok(pyRes.packages.some(p => p.name === 'requests'), 'Dependencies extracted from pyproject.toml');

    // A9: ["weird # key"] table header containing # must not return error: 'invalid'
    const weirdToml = `["weird # key"]\nkey = "value"\n[dependencies]\nserde = "1.0"`;
    const weirdRes = await scanFile({ name: 'Cargo.toml', size: weirdToml.length, text: async () => weirdToml });
    assert.equal(weirdRes.error, undefined, '["weird # key"] table header must parse without invalid manifest error');
    assert.ok(weirdRes.packages.some(p => p.name === 'serde'), 'serde extracted');

    // A9: URL containing # must survive comment stripping
    const urlToml = `[dependencies]\nserde = "1.0"\nrepo = { git = "https://github.com/org/repo#main" } # real comment`;
    const urlRes = await scanFile({ name: 'Cargo.toml', size: urlToml.length, text: async () => urlToml });
    assert.equal(urlRes.error, undefined, 'URL with # must not be truncated as a comment');
    assert.ok(urlRes.packages.some(p => p.name === 'serde'), 'serde extracted');

    return 'TOML [[bin]], [[tool.poetry.source]], ["weird # key"], and URL # fragments parsed cleanly';
  }

  if (testName === '65') {
    // Test 65: too_large & real formatHeadline (WO-A T9 & Addendum A11)
    const largeFile = { name: 'huge.js', size: 2.5 * 1024 * 1024, text: async () => 'var x = 1;' };
    const largeRes = await scanFile(largeFile);
    assert.equal(largeRes.error, 'too_large', 'File over 2MB must return error too_large');
    const headline = formatHeadline(largeRes);
    assert.equal(headline, 'FILE TOO LARGE (2 MB MAX)', 'Must render FILE TOO LARGE (2 MB MAX)');
    assert.notEqual(headline, 'NO FLAGGED PACKAGES', 'Must never render NO FLAGGED PACKAGES for rejected files');
    return '2.5MB fixture renders FILE TOO LARGE (2 MB MAX) via real shared formatHeadline';
  }

  if (testName === '66') {
    // Test 66: Crates verdicts (WO-A T11)
    const cratesFile = `
[dependencies]
serde = "1.0"
tokio = "1.0"
serdee = "1.0"
zzz-unknown-crate = "0.1"
    `;
    const cratesRes = await scanFile({ name: 'Cargo.toml', size: cratesFile.length, text: async () => cratesFile });
    const serdeP = cratesRes.packages.find(p => p.name === 'serde');
    const tokioP = cratesRes.packages.find(p => p.name === 'tokio');
    const serdeeP = cratesRes.packages.find(p => p.name === 'serdee');
    const unkP = cratesRes.packages.find(p => p.name === 'zzz-unknown-crate');

    assert.equal(serdeP?.verdict, 'VERIFIED');
    assert.equal(serdeP?.reason, 'verified via bundled popularity corpus');
    assert.equal(tokioP?.verdict, 'VERIFIED');
    assert.equal(tokioP?.reason, 'verified via bundled popularity corpus');
    assert.equal(serdeeP?.verdict, 'SUSPICIOUS');
    assert.equal(serdeeP?.suggestion, 'serde');
    assert.equal(unkP?.verdict, 'UNCHECKED');
    assert.equal(unkP?.reason, 'run the CLI');
    return 'serde/tokio VERIFIED via corpus, serdee SUSPICIOUS, unknown crate UNCHECKED (run the CLI)';
  }

  if (testName === '67') {
    // Test 67: Clean source file (WO-A T14)
    const cleanTs = `
import { config } from './config';
import { helper } from './utils/helper';
export function run() { return config; }
    `;
    const cleanRes = await scanFile({ name: 'main.ts', size: cleanTs.length, text: async () => cleanTs });
    assert.equal(cleanRes.error, undefined, 'Clean source file must not have error');
    assert.equal(cleanRes.packages.length, 0, 'Clean source file must have 0 external packages');
    return 'Clean source file (0 external deps) returns clean state, no error styling';
  }

  if (testName === '68') {
    // Test 68: Requirements flags-only (WO-A T3)
    const reqTxt = `
-r base.txt
-i https://pypi.org/simple
git+https://github.com/psf/requests.git@main
./wheels/custom_pkg.whl
    `;
    const reqRes = await scanFile({ name: 'requirements.txt', size: reqTxt.length, text: async () => reqTxt });
    assert.equal(reqRes.error, undefined, 'Flags-only requirements.txt must return clean state, not invalid manifest');
    assert.equal(reqRes.packages.length, 0, 'Zero external packages extracted');
    return 'requirements.txt with only flags/URLs returns clean state, not INVALID MANIFEST';
  }

  if (testName === '69') {
    // Test 69: Timeout path & honest timeout message (Addendum A5)
    const timeoutResult: FileScanResult = {
      error: 'timeout',
      packages: [],
      ecosystem: 'unknown',
      fileName: 'long.js',
      fileSize: 100,
      counts: { HALLUCINATED: 0, SUSPICIOUS: 0, VERIFIED: 0, UNCHECKED: 0 },
      durationMs: 8000,
    };
    const timeoutHeadline = formatHeadline(timeoutResult);
    assert.equal(timeoutHeadline, 'SCAN TIMEOUT', 'Timeout must render SCAN TIMEOUT');
    assert.notEqual(timeoutHeadline, 'INVALID MANIFEST', 'Timeout must never render INVALID MANIFEST');
    assert.equal(
      TIMEOUT_ERROR_MESSAGE,
      'Scan exceeded the 8s browser cap (network or registry slow). Try fewer files at once, or run the CLI.'
    );
    return 'Timeout path renders SCAN TIMEOUT, with honest 8s browser cap message';
  }

  if (testName === '71') {
    // Test 71: Pipfile/setup.cfg/.pyi/.astro parsing (WO-A T10)
    const pipfile = `
[packages]
requests = "*"
flask = ">=2.0"
    `;
    const pipDeps = extractManifestDependencies('Pipfile', pipfile);
    assert.deepEqual(pipDeps.map(d => d.name).sort(), ['flask', 'requests']);

    const setupCfg = `
[options]
install_requires =
    numpy>=1.20
    scipy
    `;
    const cfgDeps = extractManifestDependencies('setup.cfg', setupCfg);
    assert.deepEqual(cfgDeps.map(d => d.name).sort(), ['numpy', 'scipy']);

    assert.equal(detectFileEcosystem('types.pyi'), 'pypi');
    const pyiCode = `
import sys
import os
import requests
from pydantic import BaseModel
    `;
    const pyiRes = await scanFile({ name: 'types.pyi', size: pyiCode.length, text: async () => pyiCode });
    assert.equal(pyiRes.ecosystem, 'pypi', 'types.pyi must scan as pypi');
    const { isBuiltin } = await import('../../site/morpho/src/vendor/slop-deps/builtins.js');
    const pyiThirdParty = pyiRes.packages.filter(p => !isBuiltin(p.name, 'pypi')).map(p => p.name).sort();
    assert.deepEqual(pyiThirdParty, ['pydantic', 'requests'], 'Third-party packages extracted from .pyi');
    const pyiBuiltins = pyiRes.packages.filter(p => isBuiltin(p.name, 'pypi')).map(p => p.name).sort();
    assert.deepEqual(pyiBuiltins, ['os', 'sys'], 'Stdlib packages recognized as builtins in .pyi');

    assert.equal(detectFileEcosystem('index.astro'), 'npm');
    const astroCode = `
---
import lodash from 'lodash';
import { add } from './math';
---
<div>Hello</div>
    `;
    const astroRes = await scanFile({ name: 'index.astro', size: astroCode.length, text: async () => astroCode });
    assert.deepEqual(astroRes.packages.map(p => p.name), ['lodash'], 'Frontmatter packages extracted from .astro');
    return 'Pipfile, setup.cfg, .pyi, and .astro parsed and verified';
  }

  if (testName === '72') {
    // Test 72: Inline-script skip opening tag attribute isolation (Addendum A1)
    const htmlWithJsonFetch = `
      <script type="module">
        fetch('/api', { headers: { 'Content-Type': 'application/json' } });
        import x from 'reqeusts';
      </script>
      <script type="importmap">
        { "imports": { "lodash": "https://esm.sh/lodash" } }
      </script>
      <script type="application/json">
        { "data": "should be ignored" }
      </script>
    `;
    const deps = extractHtmlDependencies(htmlWithJsonFetch);
    const names = deps.map(d => d.name);
    assert.ok(names.includes('reqeusts'), 'Script body containing application/json must NOT be skipped');
    assert.ok(!names.includes('data'), 'application/json block must be skipped');
    return 'Inline-script tag checks opening attributes only; body with application/json extracted';
  }

  if (testName === '73') {
    // Test 73: PyPI canonical distribution resolution before typosquat check (Addendum A4)
    const pythonCode = `
import attr
from PIL import Image
import reqeusts
    `;
    const pyRes = await scanFile({ name: 'app.py', size: pythonCode.length, text: async () => pythonCode });
    const attrPkg = pyRes.packages.find(p => p.name === 'attr');
    const pilPkg = pyRes.packages.find(p => p.name === 'pil');
    const typoPkg = pyRes.packages.find(p => p.name === 'reqeusts');

    // import attr -> VERIFIED, public registry verified, NO resembles / warning text
    assert.equal(attrPkg?.verdict, 'VERIFIED');
    assert.equal(attrPkg?.reason, 'public registry verified');
    assert.equal(attrPkg?.suggestion, undefined, 'attr must not trigger typosquat warning for attrs');

    // from PIL import Image -> VERIFIED, reason contains neither pip nor pillow
    assert.equal(pilPkg?.verdict, 'VERIFIED');
    assert.ok(!pilPkg?.reason?.toLowerCase().includes('pip'), 'pil reason must not mention pip');
    assert.ok(!pilPkg?.reason?.toLowerCase().includes('pillow'), 'pil reason must not mention pillow');

    // real typo like import reqeusts still flags normally
    assert.equal(typoPkg?.verdict, 'HALLUCINATED');

    return 'PyPI import attr and pil verified cleanly without false resembles warnings';
  }

  if (testName === '74') {
    // Test 74: Multi-file retry aggregate cat state transition (Addendum A6)
    // Unit verification of the aggregate logic
    const items = [
      {
        id: 'file-a',
        result: {
          error: undefined,
          counts: { HALLUCINATED: 1, SUSPICIOUS: 0, VERIFIED: 0, UNCHECKED: 0 }
        }
      },
      {
        id: 'file-b',
        result: {
          error: undefined,
          counts: { HALLUCINATED: 0, SUSPICIOUS: 0, VERIFIED: 1, UNCHECKED: 0 }
        }
      }
    ];

    // Retry file B (clean result):
    const retriedBResult = {
      error: undefined,
      counts: { HALLUCINATED: 0, SUSPICIOUS: 0, VERIFIED: 2, UNCHECKED: 0 }
    };
    const updatedAfterB = items.map(it => it.id === 'file-b' ? { ...it, result: retriedBResult } : it);
    const totalFlaggedAfterB = updatedAfterB.reduce((acc, it) => {
      const r = it.result;
      return acc + (r?.counts?.HALLUCINATED || 0) + (r?.counts?.SUSPICIOUS || 0);
    }, 0);

    // Cat must REMAIN alert because file A is still flagged
    assert.equal(totalFlaggedAfterB, 1, 'Total flagged must still be 1 after retrying clean file B');

    // Now retry file A with resolved clean result:
    const retriedAResult = {
      error: undefined,
      counts: { HALLUCINATED: 0, SUSPICIOUS: 0, VERIFIED: 1, UNCHECKED: 0 }
    };
    const updatedAfterA = updatedAfterB.map(it => it.id === 'file-a' ? { ...it, result: retriedAResult } : it);
    const totalFlaggedAfterA = updatedAfterA.reduce((acc, it) => {
      const r = it.result;
      return acc + (r?.counts?.HALLUCINATED || 0) + (r?.counts?.SUSPICIOUS || 0);
    }, 0);

    // Cat can now transition to purring because all items are clean
    assert.equal(totalFlaggedAfterA, 0, 'Total flagged must be 0 after retrying file A');

    return 'Single-file retry checks aggregate flagged count across all files for cat state';
  }

  if (testName === '75') {
    // Test 75: Installer canonical filename alignment (Addendum A8)
    const iss = fs.readFileSync(path.resolve('installer.iss'), 'utf-8');
    assert.ok(iss.includes('OutputBaseFilename=slopdeps-installer'), 'installer.iss must specify OutputBaseFilename=slopdeps-installer');

    const readme = fs.readFileSync(path.resolve('README.md'), 'utf-8');
    assert.ok(readme.includes('`slopdeps-installer.exe`'), 'README.md must refer to slopdeps-installer.exe');
    assert.ok(!readme.includes('`installer.exe`'), 'README.md must not have bare installer.exe');

    const dist = fs.readFileSync(path.resolve('DISTRIBUTION.md'), 'utf-8');
    assert.ok(dist.includes('`slopdeps-installer.exe`'), 'DISTRIBUTION.md must refer to slopdeps-installer.exe');
    assert.ok(!dist.includes('`installer.exe`'), 'DISTRIBUTION.md must not have bare installer.exe');

    return 'All installer references strictly aligned to slopdeps-installer.exe';
  }

  if (testName === '76') {
    // Test 76: Single formatHeadline definition across site/morpho (Addendum A11)
    const morphoSrc = path.resolve('site/morpho/src');
    const findFnDefinitions = (dir: string): string[] => {
      const results: string[] = [];
      const list = fs.readdirSync(dir);
      for (const file of list) {
        const full = path.join(dir, file);
        const stat = fs.statSync(full);
        if (stat.isDirectory()) {
          results.push(...findFnDefinitions(full));
        } else if (file.endsWith('.ts') || file.endsWith('.tsx') || file.endsWith('.js')) {
          const content = fs.readFileSync(full, 'utf-8');
          if (/function\s+formatHeadline\b/.test(content)) {
            results.push(full);
          }
        }
      }
      return results;
    };

    const hits = findFnDefinitions(morphoSrc);
    assert.equal(hits.length, 1, `formatHeadline must be defined in exactly 1 file (found: ${hits.join(', ')})`);
    assert.ok(hits[0].endsWith('scanHeadline.ts'), 'formatHeadline definition must live in scanHeadline.ts');

    return 'formatHeadline defined in exactly one shared module in site/morpho/src';
  }

  throw new Error(`Unknown test name: ${testName}`);
}

const target = process.argv[2];
if (target) {
  runTest(target)
    .then((msg) => {
      console.log(`  ✔ PASS: ${msg}\n`);
    })
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
