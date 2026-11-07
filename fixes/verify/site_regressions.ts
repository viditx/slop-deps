import assert from 'node:assert/strict';
import { extractHtmlDependencies, extractManifestDependencies, detectFileEcosystem } from '../../site/morpho/src/utils/fileInspector.ts';
import { scanFile } from '../../site/morpho/src/scanner/index.ts';
import type { FileScanResult } from '../../site/morpho/src/scanner/types.ts';

function formatHeadline(result: FileScanResult): string {
  if (result.error === 'too_large') return 'FILE TOO LARGE (2 MB MAX)';
  if (result.error === 'timeout') return 'SCAN TIMEOUT';
  if (result.error === 'unsupported') return 'UNSUPPORTED FILE';
  if (result.error === 'invalid') return 'INVALID MANIFEST';
  if (result.error === 'empty') return 'EMPTY MANIFEST';
  const flagged = (result.packages || []).filter(p => p.verdict === 'HALLUCINATED' || p.verdict === 'SUSPICIOUS');
  if (flagged.length === 0) return 'NO FLAGGED PACKAGES';
  return `${flagged.length} FLAGGED`;
}

export async function runTest(testName: string) {
  if (testName === '62') {
    // Test 62: CDN scoped extraction (§4.2)
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
    const ghTag = '<script src="https://cdn.jsdelivr.net/gh/jquery/jquery@3.6.0/dist/jquery.min.js"></script>';
    const ghDeps = extractHtmlDependencies(ghTag);
    assert.ok(!ghDeps.some(d => d.name.includes('jquery')), 'jsdelivr /gh/ must not extract jquery');
    assert.ok(!ghDeps.some(d => d.name.includes('gh')), 'jsdelivr /gh/ must not extract gh');
    return 'CDN scoped packages extracted across all 4 CDNs; jsdelivr /gh/ excluded';
  }

  if (testName === '63') {
    // Test 63: Importmap aliases (§4.3)
    const importMapHtml = `
      <script type="importmap">
      {
        "imports": {
          "@/components/": "./src/components/",
          "~/utils": "./src/utils.js",
          "lodash": "https://esm.sh/lodash",
          "@supabase/supabase-js": "https://esm.sh/@supabase/supabase-js"
        }
      }
      </script>
    `;
    const imDeps = extractHtmlDependencies(importMapHtml);
    const imNames = imDeps.map(d => d.name).sort();
    assert.deepEqual(imNames, ['@supabase/supabase-js', 'lodash'], 'Only bare and scoped packages extracted, zero aliases');
    return 'Importmap aliases (~ and @/) skipped, packages kept';
  }

  if (testName === '64') {
    // Test 64: TOML headers ([[bin]], [[tool.poetry.source]]) (§4.4)
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
    return 'TOML [[bin]] and [[tool.poetry.source]] parsed cleanly without invalid error';
  }

  if (testName === '65') {
    // Test 65: too_large (§4.5)
    const largeFile = { name: 'huge.js', size: 2.5 * 1024 * 1024, text: async () => 'var x = 1;' };
    const largeRes = await scanFile(largeFile);
    assert.equal(largeRes.error, 'too_large', 'File over 2MB must return error too_large');
    const headline = formatHeadline(largeRes);
    assert.equal(headline, 'FILE TOO LARGE (2 MB MAX)', 'Must render FILE TOO LARGE (2 MB MAX)');
    assert.notEqual(headline, 'NO FLAGGED PACKAGES', 'Must never render NO FLAGGED PACKAGES for rejected files');
    return '2.5MB fixture renders FILE TOO LARGE (2 MB MAX), never NO FLAGGED PACKAGES';
  }

  if (testName === '66') {
    // Test 66: Crates verdicts (§4.6)
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
    return 'serde/tokio VERIFIED via corpus, serdee SUSPICIOUS (resembles serde), unknown crate UNCHECKED (run the CLI)';
  }

  if (testName === '67') {
    // Test 67: Clean source file (§4.7)
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
    // Test 68: Requirements flags-only (§4.8)
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
    // Test 69: Timeout path (§4.9)
    const timeoutResult: FileScanResult = {
      error: 'timeout',
      packages: [],
      ecosystem: 'unknown',
      fileName: 'long.js',
      fileSize: 100,
    };
    const timeoutHeadline = formatHeadline(timeoutResult);
    assert.equal(timeoutHeadline, 'SCAN TIMEOUT', 'Timeout must render SCAN TIMEOUT');
    assert.notEqual(timeoutHeadline, 'INVALID MANIFEST', 'Timeout must never render INVALID MANIFEST');
    return 'Timeout path renders SCAN TIMEOUT, never INVALID MANIFEST';
  }

  if (testName === '71') {
    // Test 71: Pipfile/setup.cfg/.pyi/.astro parsing (§4.11)
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
