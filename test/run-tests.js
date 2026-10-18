import assert from 'node:assert/strict';
import path from 'node:path';
import { scanDirectory } from '../src/index.js';
import { extractJsImports } from '../src/extractors/js-ts.js';
import { extractPackageJson, extractPyProjectToml, extractSetupCfg, extractPipfile, extractSetupPy } from '../src/extractors/manifests.js';
import { extractPythonImports } from '../src/extractors/python.js';
import { resolvePyPiDistributionName } from '../src/pypi-map.js';
import { isBuiltin } from '../src/builtins.js';

async function run() {
  console.log('🧪 Running slop-deps test suite...\n');

  // Test 1: Self-scan src/ must have zero foreign dependencies
  console.log('Test 1: Self-scan src/ (must be 100% clean, zero foreign deps)');
  const srcResult = await scanDirectory(path.resolve('src'));
  assert.equal(srcResult.stats.critical, 0, 'src/ must have 0 critical findings');
  assert.equal(srcResult.stats.total, 0, 'src/ must have 0 external dependencies');
  console.log('  ✔ PASS: src/ contains zero external dependencies\n');

  // Test 2: Scan test fixtures
  console.log('Test 2: Scan test fixtures directory (must catch exactly 5 hallucinated packages)');
  const testResult = await scanDirectory(path.resolve('test'));

  assert.equal(testResult.stats.critical, 5, `Expected exactly 5 critical hallucinations, got ${testResult.stats.critical}`);
  assert.ok(testResult.stats.clean + (testResult.stats.warn || 0) === 9, `Expected 9 total resolved test packages, got ${testResult.stats.clean + (testResult.stats.warn || 0)}`);

  const criticalNames = new Set(
    testResult.findings.filter(f => f.risk === 'CRITICAL').map(f => f.name)
  );

  assert.ok(criticalNames.has('react-magic-super-spring-hallucinated-xyz-123'), 'Missing npm code hallucination');
  assert.ok(criticalNames.has('torch_magic_nonexistent_tensor_404'), 'Missing pypi code hallucination');
  assert.ok(criticalNames.has('fake_dynamic_hallucinated_pkg_777'), 'Missing pypi dynamic __import__ hallucination');
  assert.ok(criticalNames.has('fake-dev-hallucinated-xyz-999'), 'Missing package.json devDependencies hallucination');
  assert.ok(criticalNames.has('fake-pyproject-hallucinated-xyz-888'), 'Missing pyproject.toml hallucination');

  console.log('  ✔ PASS: All 5 hallucinated fixtures caught across JS, Python (static & dynamic), package.json, pyproject.toml\n');

  // Test 3: Verify workspace, local files, and URLs were NOT treated as registry packages
  console.log('Test 3: Verify ignore list for local workspaces and URLs');
  const allNames = new Set(testResult.findings.map(f => f.name));
  assert.ok(!allNames.has('internal-ui'), 'Workspace dependency must be ignored');
  assert.ok(!allNames.has('local-helper'), 'File dependency must be ignored');
  assert.ok(!allNames.has('git'), 'Git URL must not be extracted as package');
  assert.ok(!allNames.has('https'), 'HTTPS URL must not be extracted as package');
  assert.ok(!allNames.has('fake_docstring_package_xyz'), 'Docstring imports must be ignored');
  assert.ok(!allNames.has('fake_inline_comment_pkg'), 'Inline comment imports must be ignored');
  assert.ok(!allNames.has('$app'), 'SvelteKit $app must be ignored');
  assert.ok(!allNames.has('$lib'), 'SvelteKit $lib must be ignored');
  assert.ok(!allNames.has('@components/Header'), 'TypeScript path alias @components/Header must be ignored');
  assert.ok(!allNames.has('@utils/format'), 'TypeScript path alias @utils/format must be ignored');
  assert.ok(!allNames.has('lodash?raw'), 'Vite query parameter ?raw must be stripped to base package');
  console.log('  ✔ PASS: Workspaces, URLs, query params, tsconfig aliases, docstrings, and comments successfully ignored\n');

  // Test 4: JSX text isolation (docs & tutorial text in JSX must NOT extract as imports)
  console.log('Test 4: JSX tutorial / documentation text isolation');
  const jsxSample = `
    export function Tutorial() {
      return (
        <div>
          <pre>
            import { fakeHook } from 'hallucinated-doc-pkg';
          </pre>
          <code>import foo from 'fake-code-pkg';</code>
        </div>
      );
    }
  `;
  const jsxResult = extractJsImports(jsxSample, 'Tutorial.tsx');
  assert.equal(jsxResult.length, 0, 'Imports inside JSX elements must not be extracted');
  console.log('  ✔ PASS: Text inside JSX tags ignored cleanly\n');

  // Test 5: Scoped npm aliases in package.json
  console.log('Test 5: Scoped npm aliases in package.json');
  const pkgJsonSample = JSON.stringify({
    dependencies: {
      'custom-button': 'npm:@radix-ui/react-button@^1.0.0',
      'old-lodash': 'npm:lodash@^4.17.21'
    }
  });
  const pkgAliases = extractPackageJson(pkgJsonSample);
  const aliasNames = pkgAliases.map(p => p.name);
  assert.ok(aliasNames.includes('@radix-ui/react-button'), 'Scoped package alias must resolve to target @radix-ui/react-button');
  assert.ok(aliasNames.includes('lodash'), 'Unscoped package alias must resolve to target lodash');
  assert.ok(!aliasNames.includes('custom-button'), 'Local key name must not be extracted');
  console.log('  ✔ PASS: Scoped npm: aliases correctly resolve to remote package name\n');

  // Test 6: Python multi-line backslash import continuation
  console.log('Test 6: Python backslash line continuations');
  const pyContinued = `
    import os, \\
           sys, \\
           requests, \\
           fastapi
  `;
  const pyContResult = extractPythonImports(pyContinued, 'sample.py');
  const pyContNames = pyContResult.map(p => p.name);
  assert.ok(pyContNames.includes('requests'), 'Backslash continued import requests must be extracted');
  assert.ok(pyContNames.includes('fastapi'), 'Backslash continued import fastapi must be extracted');
  console.log('  ✔ PASS: Multi-line Python imports with backslashes correctly merged\n');

  // Test 7: pyproject.toml PEP 621 optional-dependencies and Poetry groups
  console.log('Test 7: pyproject.toml optional-dependencies and Poetry groups');
  const tomlSample = `
    [project]
    dependencies = ["requests>=2.0"]

    [project.optional-dependencies]
    test = ["pytest>=7.0", "coverage"]
    docs = ["mkdocs"]

    [dependency-groups]
    dev = ["black", "ruff"]

    [tool.poetry.dependencies]
    pydantic = "^2.0"

    [tool.poetry.group.lint.dependencies]
    flake8 = "^6.0"
  `;
  const tomlResult = extractPyProjectToml(tomlSample);
  const tomlNames = new Set(tomlResult.map(p => p.name));
  assert.ok(tomlNames.has('requests'));
  assert.ok(tomlNames.has('pytest'));
  assert.ok(tomlNames.has('coverage'));
  assert.ok(tomlNames.has('mkdocs'));
  assert.ok(tomlNames.has('black'));
  assert.ok(tomlNames.has('ruff'));
  assert.ok(tomlNames.has('pydantic'));
  assert.ok(tomlNames.has('flake8'));
  console.log('  ✔ PASS: All PEP 621, PEP 735, and Poetry dependency groups extracted\n');

  // Test 8: Dynamic imports with template literals and options parameters
  console.log('Test 8: Dynamic imports with template literals and options');
  const dynamicSample = `
    const mod = await import('pkg-with-attr', { with: { type: 'json' } });
    const req = require(\`pkg-template-literal\`);
    const res = require.resolve('pkg-with-paths', { paths: ['/tmp'] });
  `;
  const dynResult = extractJsImports(dynamicSample, 'dynamic.js');
  const dynNames = new Set(dynResult.map(p => p.name));
  assert.ok(dynNames.has('pkg-with-attr'), 'Dynamic import with { with: ... } options must match');
  assert.ok(dynNames.has('pkg-template-literal'), 'Require with static template literal must match');
  assert.ok(dynNames.has('pkg-with-paths'), 'Require.resolve with options must match');
  console.log('  ✔ PASS: Dynamic imports with attributes and template literals handled\n');

  // Test 9: setup.cfg support
  console.log('Test 9: setup.cfg Python manifest');
  const setupCfgSample = `
    [options]
    install_requires =
        requests>=2.28.0
        urllib3

    [options.extras_require]
    test =
        pytest>=7.0
  `;
  const cfgResult = extractSetupCfg(setupCfgSample);
  const cfgNames = new Set(cfgResult.map(p => p.name));
  assert.ok(cfgNames.has('requests'));
  assert.ok(cfgNames.has('urllib3'));
  assert.ok(cfgNames.has('pytest'));
  console.log('  ✔ PASS: setup.cfg dependencies extracted\n');

  // Test 10: Python PEP 420 Namespace and canonical mappings
  console.log('Test 10: Python PEP 420 Namespace and canonical distribution mapping');
  assert.equal(resolvePyPiDistributionName('google.cloud.storage'), 'google-cloud-storage');
  assert.equal(resolvePyPiDistributionName('google.cloud.bigquery'), 'google-cloud-bigquery');
  assert.equal(resolvePyPiDistributionName('google.protobuf'), 'protobuf');
  assert.equal(resolvePyPiDistributionName('azure.storage.blob'), 'azure-storage-blob');
  assert.equal(resolvePyPiDistributionName('azure.identity'), 'azure-identity');
  assert.equal(resolvePyPiDistributionName('pkg_resources'), 'setuptools');
  assert.equal(resolvePyPiDistributionName('win32com'), 'pywin32');
  assert.equal(resolvePyPiDistributionName('pythoncom'), 'pywin32');
  assert.equal(resolvePyPiDistributionName('cryptodome'), 'pycryptodomex');
  assert.equal(resolvePyPiDistributionName('tortoise'), 'tortoise-orm');

  const nsPySample = `
    from google.cloud import storage
    from google.protobuf import message
    from azure.identity import DefaultAzureCredential
    import win32com.client
    import pkg_resources
  `;
  const nsResult = extractPythonImports(nsPySample, 'ns.py');
  const nsNames = nsResult.map(p => resolvePyPiDistributionName(p.name));
  assert.ok(nsNames.includes('google-cloud-storage'), 'Google Cloud service must resolve to google-cloud-storage');
  assert.ok(nsNames.includes('protobuf'), 'Google protobuf must resolve to protobuf');
  assert.ok(nsNames.includes('azure-identity'), 'Azure identity must resolve to azure-identity');
  assert.ok(nsNames.includes('pywin32'), 'win32com must resolve to pywin32');
  assert.ok(nsNames.includes('setuptools'), 'pkg_resources must resolve to setuptools');
  console.log('  ✔ PASS: Python PEP 420 namespace packages and Windows/tooling imports mapped\n');

  // Test 11: Nuxt root aliases and path alias handling
  console.log('Test 11: Nuxt root aliases (@@/ and ~~)');
  const nuxtSample = `
    import Header from '@@/components/Header';
    import Footer from '~~/components/Footer';
  `;
  const nuxtResult = extractJsImports(nuxtSample, 'nuxt.vue');
  assert.equal(nuxtResult.length, 0, 'Nuxt @@ and ~~ root aliases must not be flagged as external packages');
  console.log('  ✔ PASS: Nuxt root aliases ignored cleanly\n');

  // Test 12: Python inline statement and semicolon splitting
  console.log('Test 12: Python semicolons and inline statements');
  const pySemicolonSample = `
    import requests; import yaml; import fastapi
    x = 1; from pydantic import BaseModel
    if True: import click
    try: import uvicorn
  `;
  const pySemiResult = extractPythonImports(pySemicolonSample, 'semi.py');
  const pySemiNames = new Set(pySemiResult.map(p => p.name));
  assert.ok(pySemiNames.has('requests'), 'requests must be extracted across semicolon');
  assert.ok(pySemiNames.has('yaml'), 'yaml must be extracted across semicolon');
  assert.ok(pySemiNames.has('fastapi'), 'fastapi must be extracted across semicolon');
  assert.ok(pySemiNames.has('pydantic'), 'pydantic must be extracted after semicolon statement');
  assert.ok(pySemiNames.has('click'), 'click must be extracted after if condition');
  assert.ok(pySemiNames.has('uvicorn'), 'uvicorn must be extracted after try: block');
  console.log('  ✔ PASS: Python semicolons, if-blocks, and try-blocks correctly split\n');

  // Test 13: Minified JS/TS imports without whitespace
  console.log('Test 13: Minified JS/TS import statements');
  const minifiedSample = `
    import{foo}from"minified-lib-1";
    export{bar}from"minified-lib-2";
    import*as ns from"minified-lib-3";
    export*from"minified-lib-4";
  `;
  const minResult = extractJsImports(minifiedSample, 'min.js');
  const minNames = new Set(minResult.map(p => p.name));
  assert.ok(minNames.has('minified-lib-1'));
  assert.ok(minNames.has('minified-lib-2'));
  assert.ok(minNames.has('minified-lib-3'));
  assert.ok(minNames.has('minified-lib-4'));
  console.log('  ✔ PASS: Minified JS/TS import statements correctly extracted\n');

  // Test 14: Test framework mock extraction (jest.mock, vi.mock)
  console.log('Test 14: Test framework mock extraction');
  const mockSample = `
    jest.mock('mocked-dep-jest');
    vi.mock('mocked-dep-vitest');
    const act = jest.requireActual('mocked-actual-pkg');
  `;
  const mockResult = extractJsImports(mockSample, 'test.spec.ts');
  const mockNames = new Set(mockResult.map(p => p.name));
  assert.ok(mockNames.has('mocked-dep-jest'));
  assert.ok(mockNames.has('mocked-dep-vitest'));
  assert.ok(mockNames.has('mocked-actual-pkg'));
  console.log('  ✔ PASS: jest.mock, vi.mock, and requireActual extracted\n');

  // Test 15: Pipfile package extraction
  console.log('Test 15: Pipfile package extraction');
  const pipfileSample = `
    [[source]]
    url = "https://pypi.org/simple"
    verify_ssl = true
    name = "pypi"

    [packages]
    requests = "*"
    flask = ">=2.0"
    "psycopg2-binary" = "==2.9.3"

    [dev-packages]
    pytest = ">=7.0"
    black = "*"
  `;
  const pipfileResult = extractPipfile(pipfileSample);
  const pipfileNames = new Set(pipfileResult.map(p => p.name));
  assert.ok(pipfileNames.has('requests'));
  assert.ok(pipfileNames.has('flask'));
  assert.ok(pipfileNames.has('psycopg2-binary'));
  assert.ok(pipfileNames.has('pytest'));
  assert.ok(pipfileNames.has('black'));
  console.log('  ✔ PASS: Pipfile [packages] and [dev-packages] extracted\n');

  // Test 16: setup.py package extraction
  console.log('Test 16: setup.py package extraction');
  const setupPySample = `
    from setuptools import setup

    setup(
      name="my-package",
      version="1.0.0",
      install_requires=[
        "requests>=2.25.0",
        "urllib3<2.0"
      ],
      extras_require={
        "dev": ["pytest", "black"],
        "docs": ["sphinx"]
      }
    )
  `;
  const setupPyResult = extractSetupPy(setupPySample);
  const setupPyNames = new Set(setupPyResult.map(p => p.name));
  assert.ok(setupPyNames.has('requests'));
  assert.ok(setupPyNames.has('urllib3'));
  assert.ok(setupPyNames.has('pytest'));
  assert.ok(setupPyNames.has('black'));
  assert.ok(setupPyNames.has('sphinx'));
  assert.ok(!setupPyNames.has('dev'), 'Dict key dev must not be extracted');
  assert.ok(!setupPyNames.has('docs'), 'Dict key docs must not be extracted');
  console.log('  ✔ PASS: setup.py install_requires and extras_require extracted cleanly\n');

  // Test 17: Canonical mappings and python builtins
  console.log('Test 17: Canonical mappings and python builtins');
  assert.equal(resolvePyPiDistributionName('mysqldb'), 'mysqlclient');
  assert.equal(resolvePyPiDistributionName('wx'), 'wxPython');
  assert.equal(resolvePyPiDistributionName('google.ai.generativelanguage'), 'google-ai-generativelanguage');
  assert.ok(isBuiltin('antigravity', 'pypi'), 'antigravity must be recognized as python stdlib builtin');
  console.log('  ✔ PASS: Canonical mappings and python builtins verified\n');

  console.log('🎉 All test assertions passed successfully!');
}

run().catch((err) => {
  console.error('\n❌ Test assertion failed:', err.message);
  process.exit(1);
});
