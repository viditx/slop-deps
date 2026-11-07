import assert from 'node:assert/strict';
import path from 'node:path';
import { scanDirectory } from '../src/index.js';
import { extractJsImports } from '../src/extractors/js-ts.js';
import { extractPackageJson, extractRequirementsTxt, extractPyProjectToml, extractSetupCfg, extractPipfile, extractSetupPy } from '../src/extractors/manifests.js';
import { extractPythonImports } from '../src/extractors/python.js';
import { resolvePyPiDistributionName } from '../src/pypi-map.js';
import { isBuiltin } from '../src/builtins.js';
import { checkNpmPackage } from '../src/registries/npm.js';
import { checkPyPiPackage } from '../src/registries/pypi.js';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';

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

  // Test 18: CLI exit codes and argument verification
  console.log('Test 18: CLI exit codes and argument parsing');
  const binPath = path.resolve('bin', 'slop-deps.js');

  const vResult = spawnSync(process.execPath, [binPath, '--version'], { encoding: 'utf-8' });
  assert.equal(vResult.status, 0, '--version must exit 0');
  assert.ok(vResult.stdout.includes('1.4.0'), '--version must output version');

  const invResult = spawnSync(process.execPath, [binPath, '--unknown-flag'], { encoding: 'utf-8' });
  assert.equal(invResult.status, 2, 'Unrecognized option must exit 2');

  const missDirResult = spawnSync(process.execPath, [binPath, '-d'], { encoding: 'utf-8' });
  assert.equal(missDirResult.status, 2, 'Missing directory arg after -d must exit 2');

  const nonExistDir = spawnSync(process.execPath, [binPath, '--dir', 'non_existent_folder_xyz'], { encoding: 'utf-8' });
  assert.equal(nonExistDir.status, 2, 'Non-existent directory must fail-closed with exit 2');

  console.log('  ✔ PASS: CLI flags, fail-closed exits, and argument validation verified\n');

  // Test 19: PEP 508 marker isolation and audit canonical mappings
  console.log('Test 19: PEP 508 marker isolation, runtime builtins, and canonical mappings');
  const pep508Toml = `
    [project]
    dependencies = [
      "pydantic >= 2.0; python_version >= '3.10' and platform_system == 'Linux'",
      "typing-extensions >= 4.0; os_name == 'posix' or sys_platform == 'darwin'"
    ]
  `;
  const pep508Result = extractPyProjectToml(pep508Toml);
  const pep508Names = new Set(pep508Result.map(p => p.name));
  assert.ok(pep508Names.has('pydantic'));
  assert.ok(pep508Names.has('typing-extensions'));
  assert.ok(!pep508Names.has('and'), 'Marker boolean "and" must not be extracted');
  assert.ok(!pep508Names.has('or'), 'Marker boolean "or" must not be extracted');
  assert.ok(!pep508Names.has('Linux'), 'Marker operand "Linux" must not be extracted');

  assert.equal(resolvePyPiDistributionName('llama_cpp'), 'llama-cpp-python');
  assert.equal(resolvePyPiDistributionName('appium'), 'Appium-Python-Client');
  assert.equal(resolvePyPiDistributionName('uuid_extensions'), 'uuid7');
  assert.equal(resolvePyPiDistributionName('google.oauth2'), 'google-auth');
  assert.equal(resolvePyPiDistributionName('google.auth.transport'), 'google-auth');
  assert.equal(resolvePyPiDistributionName('googleapiclient'), 'google-api-python-client');
  assert.ok(isBuiltin('sidecar_sdk', 'npm'), 'sidecar_sdk must be recognized as Antigravity host builtin in JS/npm');
  assert.ok(isBuiltin('bmesh', 'pypi'), 'bmesh must be recognized as Blender builtin');
  assert.ok(isBuiltin('sidecar_sdk', 'pypi'), 'sidecar_sdk must be recognized as Antigravity host builtin');
  console.log('  ✔ PASS: PEP 508 markers, dynamic pywin32, Google auth/APIs, and host builtins verified\n');

  // Test 20: Regex literal with braces isolates brace counting
  console.log('Test 20: Regex literal with braces isolates brace counting');
  const regexCode = `
    const rx1 = /[{]/;
    const rx2 = /\\{/;
    const rx3 = /[a-z{}]/;
    import 'pkg-after-regex';
    export * from 'pkg-export-after-regex';
  `;
  const regexImports = extractJsImports(regexCode, 'test-regex.js').map(p => p.name);
  assert.ok(regexImports.includes('pkg-after-regex'), 'Import following regex with braces must be extracted');
  assert.ok(regexImports.includes('pkg-export-after-regex'), 'Export following regex with braces must be extracted');
  console.log('  ✔ PASS: Regex character classes with braces do not corrupt AST scope\n');

  // Test 21: Dynamic import inside template literal expressions
  console.log('Test 21: Dynamic import inside template literal expressions');
  const templateCode = "const p = `endpoint: ${import('pkg-in-template')} and ${await import('pkg-awaited')}`;";
  const templateImports = extractJsImports(templateCode, 'test-template.js').map(p => p.name);
  assert.ok(templateImports.includes('pkg-in-template'), 'Dynamic import inside template expression must be extracted');
  assert.ok(templateImports.includes('pkg-awaited'), 'Awaited dynamic import inside template expression must be extracted');
  console.log('  ✔ PASS: Template literal interpolations parsed without swallowing dynamic imports\n');

  // Test 22: Python wildcard imports
  console.log('Test 22: Python wildcard imports');
  const pyWildcard = `
    from math_super_pkg import *
    from os_extended import *
  `;
  const wildcardImports = extractPythonImports(pyWildcard, 'test_wildcard.py').map(p => p.name);
  assert.ok(wildcardImports.includes('math_super_pkg'), 'from ... import * must be extracted');
  assert.ok(wildcardImports.includes('os_extended'), 'from ... import * must be extracted');
  console.log('  ✔ PASS: Python wildcard from ... import * extracted cleanly\n');

  // Test 23: Python inline statements (with, async with, async for, def)
  console.log('Test 23: Python inline statements with colons');
  const pyInline = `
    with context_manager(): import pkg_with
    async with async_ctx(): import pkg_async_with
    def helper(): import pkg_def
    for item in items: import pkg_for
    async for item in async_items: import pkg_async_for
  `;
  const inlineImports = extractPythonImports(pyInline, 'test_inline.py').map(p => p.name);
  assert.ok(inlineImports.includes('pkg_with'), 'Import after inline with must be extracted');
  assert.ok(inlineImports.includes('pkg_async_with'), 'Import after inline async with must be extracted');
  assert.ok(inlineImports.includes('pkg_def'), 'Import after inline def must be extracted');
  assert.ok(inlineImports.includes('pkg_for'), 'Import after inline for must be extracted');
  assert.ok(inlineImports.includes('pkg_async_for'), 'Import after inline async for must be extracted');
  console.log('  ✔ PASS: Python colon statements correctly split for inline imports\n');

  // Test 24: package.json subpath dependency sanitization
  console.log('Test 24: package.json subpath dependency keys');
  const subpathPkgJson = JSON.stringify({
    dependencies: {
      '@my-scope/some-lib/subpath': '^1.0.0',
      'regular-lib/feature': '^2.0.0'
    }
  });
  const subpathImports = extractPackageJson(subpathPkgJson).map(p => p.name);
  assert.ok(subpathImports.includes('@my-scope/some-lib'), 'Scoped subpath key must be sanitized to package name');
  assert.ok(subpathImports.includes('regular-lib'), 'Unscoped subpath key must be sanitized to package name');
  assert.ok(!subpathImports.includes('@my-scope/some-lib/subpath'), 'Raw subpath must not be used');
  console.log('  ✔ PASS: package.json subpath dependency keys stripped of trailing paths\n');

  // Test 25: pyproject.toml [build-system] and [tool.flit.metadata] requires
  console.log('Test 25: pyproject.toml build-system and flit requires');
  const buildSysToml = `
    [build-system]
    requires = ["flit_core >=3.2,<4", "setuptools>=61.0"]
    build-backend = "flit_core.buildapi"

    [tool.flit.metadata]
    module = "my_tool"
    requires = ["requests >=2.20"]
  `;
  const buildSysImports = extractPyProjectToml(buildSysToml).map(p => p.name);
  assert.ok(buildSysImports.includes('flit_core'), 'build-system requires must be extracted');
  assert.ok(buildSysImports.includes('setuptools'), 'build-system requires must be extracted');
  assert.ok(buildSysImports.includes('requests'), 'flit metadata requires must be extracted');
  console.log('  ✔ PASS: pyproject.toml build-system and flit metadata requires extracted\n');

  // Test 26: CLI positional directory argument & invalid package specifiers
  console.log('Test 26: CLI positional argument & invalid npm specifier handling');
  const posResult = spawnSync(process.execPath, [binPath, 'src', '--json'], { encoding: 'utf-8' });
  assert.equal(posResult.status, 0, 'slop-deps <dir> --json must exit 0 on clean dir');
  const posParsed = JSON.parse(posResult.stdout);
  assert.equal(posParsed.stats.critical, 0, 'src scan via positional arg must have 0 critical');

  const inv1 = await checkNpmPackage(' ');
  assert.equal(inv1.status, 'INVALID', 'Whitespace npm package must return INVALID');
  const inv2 = await checkNpmPackage('..');
  assert.equal(inv2.status, 'INVALID', 'Path traversal specifier must return INVALID');
  console.log('  ✔ PASS: CLI positional directory argument and npm invalid specifier validation verified\n');

  // Test 27: Block comments without newlines do not fuse tokens
  console.log('Test 27: Block comments without newlines do not fuse tokens');
  const commentCode = "import/*comment*/foo from 'evil-comment-pkg';\nexport/*comment*/{ bar } from 'evil-export-pkg';";
  const commentImports = extractJsImports(commentCode, 'test-comment.js').map(p => p.name);
  assert.ok(commentImports.includes('evil-comment-pkg'), 'Import with newline-less block comment must be extracted');
  assert.ok(commentImports.includes('evil-export-pkg'), 'Export with newline-less block comment must be extracted');
  console.log('  ✔ PASS: Token fusion across inline block comments prevented\n');

  // Test 28: TypeScript generic arrow function does not drop subsequent dynamic imports
  console.log('Test 28: TypeScript generic arrow function does not drop subsequent dynamic imports');
  const genericCode = "const fn = <T>(v: T) => { const p = require('pkg-after-generic'); };";
  const genericImports = extractJsImports(genericCode, 'test-generic.ts').map(p => p.name);
  assert.ok(genericImports.includes('pkg-after-generic'), 'require() after generic arrow function must be extracted');
  console.log('  ✔ PASS: TypeScript generic arrow functions do not corrupt tag tracker\n');

  // Test 29: Comparison operator does not drop subsequent dynamic imports
  console.log('Test 29: Comparison operator does not drop subsequent dynamic imports');
  const compCode = "const x = a <b ? foo : c > d; const p = require('pkg-after-comparison');";
  const compImports = extractJsImports(compCode, 'test-comp.js').map(p => p.name);
  assert.ok(compImports.includes('pkg-after-comparison'), 'require() after comparison expression must be extracted');
  console.log('  ✔ PASS: Comparison operators outside JSX correctly distinguished from tags\n');

  // Test 30: Dynamic import inside JSX embedded expression
  console.log('Test 30: Dynamic import inside JSX embedded expression');
  const jsxExprCode = "<div>{import('dynamic-jsx-child-pkg')}</div>";
  const jsxExprImports = extractJsImports(jsxExprCode, 'test-jsx-expr.tsx').map(p => p.name);
  assert.ok(jsxExprImports.includes('dynamic-jsx-child-pkg'), 'Dynamic import inside JSX {} expression must be extracted');
  console.log('  ✔ PASS: Dynamic imports inside JSX expressions preserved while child text is ignored\n');

  // Test 31: Scoped package isolation against local folder names
  console.log('Test 31: Scoped package isolation against local folder names');
  const tempScanDir = path.resolve('test_temp_scope_isolation');
  fs.mkdirSync(path.join(tempScanDir, 'prisma'), { recursive: true });
  fs.writeFileSync(path.join(tempScanDir, 'index.js'), "import '@prisma/test-nonexistent-fixture-404';");
  const scopeScanRes = await scanDirectory(tempScanDir);
  fs.rmSync(tempScanDir, { recursive: true, force: true });
  const scopeFindings = scopeScanRes.findings.map(f => f.name);
  assert.ok(scopeFindings.includes('@prisma/test-nonexistent-fixture-404'), 'Scoped import must NOT be whitelisted simply because a matching directory exists');
  console.log('  ✔ PASS: Scoped package names verified even when local directory matches scope\n');

  // Test 32: Poetry and Pipfile local path, git, and url dependencies skipped
  console.log('Test 32: Poetry and Pipfile local path, git, and url dependencies skipped');
  const poetryToml = `
    [tool.poetry.dependencies]
    local-tool = { path = "../local-tool" }
    git-tool = { git = "https://github.com/org/tool.git" }
    url-tool = { url = "https://example.com/tool.whl" }
    real-poetry-pkg = "^1.0.0"
  `;
  const poetryDeps = extractPyProjectToml(poetryToml).map(p => p.name);
  assert.ok(!poetryDeps.includes('local-tool'), 'Poetry path dependency must be skipped');
  assert.ok(!poetryDeps.includes('git-tool'), 'Poetry git dependency must be skipped');
  assert.ok(!poetryDeps.includes('url-tool'), 'Poetry url dependency must be skipped');
  assert.ok(poetryDeps.includes('real-poetry-pkg'), 'Real registry dependency must be extracted');

  const pipfileContent = `
    [packages]
    local-pip = { path = "./my-pkg", editable = true }
    git-pip = { git = "https://github.com/org/repo.git" }
    file-pip = { file = "https://example.com/file.whl" }
    real-pip-pkg = "*"
  `;
  const pipfileDeps = extractPipfile(pipfileContent).map(p => p.name);
  assert.ok(!pipfileDeps.includes('local-pip'), 'Pipfile path dependency must be skipped');
  assert.ok(!pipfileDeps.includes('git-pip'), 'Pipfile git dependency must be skipped');
  assert.ok(!pipfileDeps.includes('file-pip'), 'Pipfile file dependency must be skipped');
  assert.ok(pipfileDeps.includes('real-pip-pkg'), 'Real Pipfile package must be extracted');
  console.log('  ✔ PASS: Local and VCS dependencies in Poetry and Pipfile ignored cleanly\n');

  // Test 33: npm package.json with git SSH URL or patch: protocol skipped
  console.log('Test 33: npm package.json git@ and patch: protocol dependencies skipped');
  const pkgJsonProtocols = JSON.stringify({
    dependencies: {
      'private-ssh-lib': 'git@github.com:my-org/private-ssh-lib.git',
      'patched-lib': 'patch:foo@1.0.0#./patches/foo.patch',
      'real-manifest-pkg': '^2.0.0'
    }
  });
  const protoDeps = extractPackageJson(pkgJsonProtocols).map(p => p.name);
  assert.ok(!protoDeps.includes('private-ssh-lib'), 'git@ SSH dependency must be skipped');
  assert.ok(!protoDeps.includes('patched-lib'), 'patch: protocol dependency must be skipped');
  assert.ok(protoDeps.includes('real-manifest-pkg'), 'Standard dependency must be extracted');
  console.log('  ✔ PASS: git@ SSH and patch: protocol ignored in package.json\n');

  // Test 34: Python paho.mqtt canonical namespace mapping and nt builtin
  console.log('Test 34: Python paho.mqtt canonical mapping and nt builtin');
  const pyPaho = "import paho.mqtt.client as mqtt\nfrom paho.mqtt import publish";
  const pahoImports = extractPythonImports(pyPaho).map(p => p.name);
  assert.ok(pahoImports.includes('paho.mqtt'), 'paho.mqtt namespace must be extracted as paho.mqtt');
  assert.equal(resolvePyPiDistributionName('paho.mqtt'), 'paho-mqtt');
  assert.ok(isBuiltin('nt', 'pypi'), 'nt must be recognized as Python Windows stdlib builtin');
  console.log('  ✔ PASS: paho.mqtt mapped to paho-mqtt and nt Windows builtin verified\n');

  // Test 35: PyPI registry upfront input sanitization
  console.log('Test 35: PyPI registry upfront input sanitization');
  const pypiInv1 = await checkPyPiPackage(' ');
  assert.equal(pypiInv1.status, 'INVALID', 'Whitespace PyPI package must return INVALID');
  const pypiInv2 = await checkPyPiPackage('..');
  assert.equal(pypiInv2.status, 'INVALID', 'Path traversal PyPI package must return INVALID');
  console.log('  ✔ PASS: PyPI invalid specifier sanitization verified\n');

  // Test 36: pyproject.toml inline array close must not leak following keys as deps
  console.log('Test 36: pyproject.toml inline-closed dependency array isolation');
  const inlineToml = `
    [project]
    name = "demo"
    dependencies = [
      "requests>=2.0" ]
    keywords = ["security", "scanner"]
    authors = [{ name = "Vidit" }]
  `;
  const inlineDeps = extractPyProjectToml(inlineToml).map(p => p.name);
  assert.ok(inlineDeps.includes('requests'), 'Inline-closed array must still extract real dependency');
  assert.ok(!inlineDeps.includes('security'), 'keywords strings after inline close must NOT become deps');
  assert.ok(!inlineDeps.includes('scanner'), 'keywords strings after inline close must NOT become deps');
  assert.ok(!inlineDeps.includes('vidit'), 'authors strings after inline close must NOT become deps');
  console.log('  ✔ PASS: keys following inline-closed dependency array are ignored\n');

  // Test 37: requirements.txt local-path and scheme direct references skipped
  console.log('Test 37: requirements.txt local path direct references skipped');
  const localReq = [
    'numpy @ file:///tmp/numpy-1.0.zip',
    'flask @ ./vendor/flask.zip',
    'django @ /opt/wheels/django.whl',
    'gunicorn==21.2'
  ].join('\n');
  const localReqDeps = extractRequirementsTxt(localReq).map(p => p.name);
  assert.ok(!localReqDeps.includes('numpy'), 'file:// direct reference must be skipped');
  assert.ok(!localReqDeps.includes('flask'), 'Relative ./path direct reference must be skipped');
  assert.ok(!localReqDeps.includes('django'), 'Absolute /path direct reference must be skipped');
  assert.ok(localReqDeps.includes('gunicorn'), 'Regular pinned requirement must be extracted');
  console.log('  ✔ PASS: file://, relative and absolute path direct refs ignored\n');

  // Test 38: Pipfile extras syntax requests[socks] extracted with extras stripped
  console.log('Test 38: Pipfile extras key syntax');
  const extrasPip = `
    [packages]
    requests[socks] = "*"
    celery = "*"
  `;
  const extrasDeps = extractPipfile(extrasPip).map(p => p.name);
  assert.ok(extrasDeps.includes('requests'), 'requests[socks] key must extract base package name');
  assert.ok(!extrasDeps.includes('requests[socks]'), 'Extras suffix must be stripped from name');
  assert.ok(extrasDeps.includes('celery'), 'Plain Pipfile key must still extract');
  console.log('  ✔ PASS: Pipfile extras keys map to base package names\n');

  // Test 39: package.json bundledDependencies / bundleDependencies arrays scanned
  console.log('Test 39: package.json bundled dependency arrays scanned');
  const bundledJson = JSON.stringify({
    name: 'demo-app',
    bundledDependencies: ['fake-bundled-hallucinated-xyz'],
    bundleDependencies: ['fake-bundle-hallucinated-abc'],
    dependencies: { react: '^18.0.0' }
  });
  const bundledDeps = extractPackageJson(bundledJson).map(p => p.name);
  assert.ok(bundledDeps.includes('fake-bundled-hallucinated-xyz'), 'bundledDependencies array entries must be extracted');
  assert.ok(bundledDeps.includes('fake-bundle-hallucinated-abc'), 'bundleDependencies array entries must be extracted');
  assert.ok(bundledDeps.includes('react'), 'Regular dependencies must still be extracted');
  console.log('  ✔ PASS: bundled dependency arrays now verified\n');

  // Test 40: OpenTelemetry core submodules map to real dists, not invented 404 names
  console.log('Test 40: OpenTelemetry submodule distribution mapping');
  assert.equal(resolvePyPiDistributionName('opentelemetry.trace'), 'opentelemetry-api');
  assert.equal(resolvePyPiDistributionName('opentelemetry.metrics'), 'opentelemetry-api');
  assert.equal(resolvePyPiDistributionName('opentelemetry.context'), 'opentelemetry-api');
  assert.equal(resolvePyPiDistributionName('opentelemetry.baggage'), 'opentelemetry-api');
  assert.equal(resolvePyPiDistributionName('opentelemetry.sdk.trace'), 'opentelemetry-sdk');
  assert.equal(resolvePyPiDistributionName('opentelemetry.sdk.metrics.export'), 'opentelemetry-sdk');
  assert.equal(resolvePyPiDistributionName('opentelemetry.instrumentation.requests'), 'opentelemetry-instrumentation-requests');
  const otelApiCheck = await checkPyPiPackage('opentelemetry.trace');
  assert.notEqual(otelApiCheck.status, 'HALLUCINATED', 'opentelemetry.trace must resolve to an existing PyPI dist, not a false CRITICAL');
  console.log('  ✔ PASS: OTel core modules map to opentelemetry-api/-sdk, no false hallucinations\n');

  // Test 41: JS import line numbers accurate after multi-line strings
  console.log('Test 41: JS import line number accuracy');
  const lineNumCode = [
    'const s = `line1',
    'line2',
    'line3`',
    "import first from 'react';",
    "import second from 'lodash';"
  ].join('\n');
  const lineNumImports = extractJsImports(lineNumCode, 'lines.js');
  const byName = Object.fromEntries(lineNumImports.map(p => [p.name, p.line]));
  assert.equal(byName.react, 4, `react must be line 4, got ${byName.react}`);
  assert.equal(byName.lodash, 5, `lodash must be line 5, got ${byName.lodash}`);
  const requireCode = 'const x = 1\nconst y = require("express")';
  const reqImports = extractJsImports(requireCode, 'req.js');
  assert.equal(reqImports[0].line, 2, `require on line 2 must report 2, got ${reqImports[0].line}`);
  console.log('  ✔ PASS: line numbers exact for imports after multi-line strings and require\n');

  // Test 42: pip constraints.txt files are scanned as requirement manifests
  console.log('Test 42: constraints.txt scanned as requirements manifest');
  const tempConstraintsDir = path.resolve('test_temp_constraints');
  fs.mkdirSync(tempConstraintsDir, { recursive: true });
  fs.writeFileSync(path.join(tempConstraintsDir, 'constraints.txt'), 'fake-constraints-hallucinated-xyz==1.0.0\n');
  const constraintsScan = await scanDirectory(tempConstraintsDir);
  fs.rmSync(tempConstraintsDir, { recursive: true, force: true });
  const constraintNames = constraintsScan.findings.filter(f => f.risk === 'CRITICAL').map(f => f.name);
  assert.ok(constraintNames.includes('fake-constraints-hallucinated-xyz'), 'Hallucinated package in constraints.txt must be caught');
  console.log('  ✔ PASS: constraints.txt entries verified against PyPI\n');

  // Test 43: Typosquat engine — variants, lookalikes, age gating
  console.log('Test 43: Typosquat engine detection');
  const { findTyposquatCandidate, typosquatSuggestion } = await import('../src/typosquat.js');
  const lodaeh = findTyposquatCandidate('lodaeh', 'npm', 10);
  assert.equal(lodaeh.canonical, 'lodash', 'lodaeh must map to lodash');
  assert.equal(lodaeh.severity, 'suspect', 'Young lodaeh must be a suspect');
  const m0rgan = findTyposquatCandidate('m0rgan', 'npm', 10);
  assert.ok(m0rgan && m0rgan.canonical === 'morgan' && m0rgan.distance === 0, 'm0rgan must be a zero-distance lookalike of morgan');
  const reqeusts = findTyposquatCandidate('reqeusts', 'pypi', 10);
  assert.ok(reqeusts && reqeusts.canonical === 'requests' && reqeusts.distance === 1, 'reqeusts must be a distance-1 transposition of requests');
  assert.equal(findTyposquatCandidate('react', 'npm', 10), null, 'Exact popular package must not flag itself');
  const oldSquat = findTyposquatCandidate('lodaeh', 'npm', 800);
  assert.equal(oldSquat.severity, 'suggestion', 'Established (1yr+) close names downgrade to suggestion');
  assert.equal(typosquatSuggestion('lodaeh', 'npm'), 'lodash', 'Dead-name suggestion must be offered');
  assert.equal(findTyposquatCandidate('colourss', 'pypi', 5), null, 'Distant names must not over-match');
  console.log('  ✔ PASS: typosquat variants, lookalike chars, transpositions, age gating verified\n');

  // Test 44: Live registry wires typosquat + install-script signals (react must stay CLEAN)
  console.log('Test 44: Registry signal wiring keeps legit giants clean');
  const reactCheck = await checkNpmPackage('react');
  assert.equal(reactCheck.risk, 'CLEAN', 'react must remain CLEAN with typosquat engine active');
  assert.equal(reactCheck.status, 'VERIFIED', 'react must remain VERIFIED');
  const requestsCheck = await checkPyPiPackage('requests');
  assert.equal(requestsCheck.risk, 'CLEAN', 'requests must remain CLEAN on PyPI side');
  console.log('  ✔ PASS: top popular packages verified without false positives\n');

  // Test 45: SARIF 2.1.0 output structure
  console.log('Test 45: SARIF 2.1.0 output structure');
  const { toSarif } = await import('../src/sarif.js');
  const sarif = toSarif([
    { name: 'fake-a', ecosystem: 'npm', risk: 'CRITICAL', status: 'HALLUCINATED', message: 'does not exist', file: 'src\\app.js', line: 12 },
    { name: 'fake-b', ecosystem: 'pypi', risk: 'HIGH', status: 'SUSPICIOUS', message: 'typosquat risk', file: 'pkg/mod.py' },
    { name: 'react', ecosystem: 'npm', risk: 'CLEAN', status: 'VERIFIED', message: 'legit', file: 'x.js', line: 1 }
  ]);
  assert.equal(sarif.version, '2.1.0', 'SARIF version must be 2.1.0');
  assert.equal(sarif.runs.length, 1, 'Exactly one run');
  assert.equal(sarif.runs[0].tool.driver.name, 'slop-deps', 'Driver name must be slop-deps');
  assert.equal(sarif.runs[0].results.length, 2, 'CLEAN findings must be omitted from results');
  assert.equal(sarif.runs[0].results[0].level, 'error', 'CRITICAL maps to error level');
  assert.equal(sarif.runs[0].results[0].ruleId, 'SD001', 'CRITICAL maps to hallucinatedPackage rule');
  assert.equal(sarif.runs[0].results[0].locations[0].physicalLocation.artifactLocation.uri, 'src/app.js', 'Windows path separators must become forward slashes');
  assert.equal(sarif.runs[0].results[0].locations[0].physicalLocation.region.startLine, 12, 'Line number preserved');
  assert.equal(sarif.runs[0].results[1].level, 'warning', 'HIGH maps to warning level');
  assert.ok(sarif.runs[0].tool.driver.rules.every(r => ['SD001', 'SD002', 'SD003'].includes(r.id)), 'Rule ids valid');
  console.log('  ✔ PASS: SARIF structure, levels, paths and rule mapping verified\n');

  // Test 46: --staged pre-commit mode scans only git-staged files
  console.log('Test 46: staged-only scan mode');
  const { scanStagedFiles } = await import('../src/index.js');
  const tempStaged = path.resolve('test_temp_staged');
  fs.mkdirSync(tempStaged, { recursive: true });
  fs.writeFileSync(path.join(tempStaged, 'staged_app.py'), 'import fake_staged_hallucinated_abc\n');
  fs.writeFileSync(path.join(tempStaged, 'unstaged_app.py'), 'import fake_unstaged_hallucinated_xyz\n');
  try {
    const gitInit = spawnSync('git', ['init'], { cwd: tempStaged, encoding: 'utf-8' });
    assert.equal(gitInit.status, 0, 'git init must succeed in temp repo');
    spawnSync('git', ['add', 'staged_app.py'], { cwd: tempStaged, encoding: 'utf-8' });
    const stagedResult = await scanStagedFiles(tempStaged);
    const stagedNames = stagedResult.findings.map(f => f.name);
    assert.ok(stagedNames.includes('fake_staged_hallucinated_abc'), 'Staged file import must be caught');
    assert.ok(!stagedNames.includes('fake_unstaged_hallucinated_xyz'), 'Unstaged file import must be ignored');
    assert.equal(stagedResult.staged, true, 'Result must be marked staged');
    assert.equal(stagedResult.stagedFileCount, 1, 'Exactly one staged file tracked');
  } finally {
    fs.rmSync(tempStaged, { recursive: true, force: true });
  }
  console.log('  ✔ PASS: staged-only extraction ignores unstaged files\n');

  // Test 47: expanded typosquat corpus coverage
  console.log('Test 47: expanded corpus coverage');
  assert.ok(findTyposquatCandidate('cheer1o', 'npm', 10), 'cheerio variants must now be caught');
  assert.ok(findTyposquatCandidate('requestz', 'npm', 10), 'request variants must be caught');
  assert.ok(findTyposquatCandidate('sqlalchmey', 'pypi', 10), 'sqlalchemy transposition must be caught');
  assert.ok(findTyposquatCandidate('pycrypt0dome', 'pypi', 10), 'pycryptodome lookalike must be caught');
  console.log('  ✔ PASS: expanded corpus catches wider typosquat variants\n');

  // Test 48: direct programmatic scan and SARIF extraction
  console.log('Test 48: direct programmatic scan & SARIF generation');
  const scanData = await scanDirectory(path.resolve('test'), { offline: true, allowConfig: false });
  assert.ok(scanData.stats && typeof scanData.stats.total === 'number', 'Scan must return stats');
  assert.ok(scanData.stats.critical >= 5, 'Fixture directory must yield its hallucinated packages');
  const sarifObj = toSarif(scanData.findings);
  assert.equal(sarifObj.version, '2.1.0', 'SARIF format must be 2.1.0');
  console.log('  ✔ PASS: headless engine yields findings, stats, and SARIF without listening sockets\n');

  // Test 49: persistent cache roundtrip with TTL semantics
  console.log('Test 49: persistent cache layer');
  const { cacheSet, cacheGet } = await import('../src/registries/cache.js');
  await cacheSet('test:roundtrip', { name: 'x', risk: 'CLEAN', status: 'VERIFIED' }, 1000);
  assert.equal((await cacheGet('test:roundtrip', 2000))?.status, 'VERIFIED', 'Fresh entry must be readable');
  assert.equal(await cacheGet('test:roundtrip', 1000 + 25 * 60 * 60 * 1000), null, 'EXISTS entries must expire after 24h');
  await cacheSet('test:squat', { name: 'y', risk: 'CRITICAL', status: 'HALLUCINATED' }, 1000);
  assert.equal((await cacheGet('test:squat', 1000 + 3 * 60 * 60 * 1000))?.status, 'HALLUCINATED', 'Within 6h the hallucination verdict replays');
  assert.equal(await cacheGet('test:squat', 1000 + 7 * 60 * 60 * 1000), null, 'HALLUCINATED entries must expire after 6h (names can get registered as traps)');
  console.log('  ✔ PASS: persistent cache TTL semantics verified\n');

  // Test 50: offline mode replays cache, never fakes verdicts
  console.log('Test 50: offline mode');
  {
    const tempOffline = path.resolve('test_temp_offline');
    fs.mkdirSync(tempOffline, { recursive: true });
    fs.writeFileSync(path.join(tempOffline, 'app.js'), "import _ from 'snowballstemmer';\nimport z from 'fake-offline-never-seen-xyz';\n");
    try {
      await checkNpmPackage('snowballstemmer'); // seed cache online (non-corpus real package)
      const offlineResult = await scanDirectory(tempOffline, { offline: true });
      const byName = Object.fromEntries(offlineResult.findings.map(f => [f.name, f]));
      assert.equal(byName.snowballstemmer?.status, 'VERIFIED', 'Cached package must replay verdict offline');
      assert.equal(byName.snowballstemmer?.cached, true, 'Replayed result must be marked cached');
      assert.equal(byName['fake-offline-never-seen-xyz']?.status, 'UNKNOWN', 'Uncached package must be UNKNOWN offline');
      assert.equal(byName['fake-offline-never-seen-xyz']?.risk, 'WARN', 'Offline unknowns must not fake CRITICAL');
    } finally {
      fs.rmSync(tempOffline, { recursive: true, force: true });
    }
  }
  console.log('  ✔ PASS: offline mode replays cache, marks unknowns honestly\n');

  // Test 51: .slopdepsrc.json extensibility
  console.log('Test 51: .slopdepsrc.json project config');
  {
    const tempRc = path.resolve('test_temp_rc');
    fs.mkdirSync(tempRc, { recursive: true });
    fs.writeFileSync(path.join(tempRc, '.slopdepsrc.json'), JSON.stringify({
      builtins: { npm: ['acme-internal-sdk'] },
      popular: { npm: ['acme-enterprise-suite'] },
      map: { my_custom_import: 'my-custom-dist' }
    }));
    fs.writeFileSync(path.join(tempRc, 'app.js'), "import sdk from 'acme-internal-sdk';\nimport s from 'acme-enterprise-su1te';\n");
    fs.writeFileSync(path.join(tempRc, 'mod.py'), 'import my_custom_import\n');
    try {
      const rcResult = await scanDirectory(tempRc);
      const names = rcResult.findings.map(f => f.name);
      assert.ok(!names.includes('acme-internal-sdk'), 'rc builtins must suppress internal packages');
      assert.ok(names.includes('acme-enterprise-su1te'), 'rc popular entries must feed the typosquat corpus');
      const mapped = rcResult.findings.find(f => f.name === 'my_custom_import');
      assert.equal(mapped?.resolvedDist, 'my-custom-dist', 'rc import map must resolve custom import to custom dist');
    } finally {
      fs.rmSync(tempRc, { recursive: true, force: true });
    }
  }
  console.log('  ✔ PASS: rc config extends builtins, corpus and import map\n');

  // Test 52: generated corpus merged at scale, no self-collisions
  console.log('Test 52: generated corpus merge');
  {
    const { corpusSize } = await import('../src/typosquat.js');
    assert.ok(corpusSize('npm') > 2000, `npm corpus must exceed 2000 entries after generated merge (got ${corpusSize('npm')})`);
    assert.ok(corpusSize('pypi') > 1000, `pypi corpus must exceed 1000 entries after generated merge (got ${corpusSize('pypi')})`);
    assert.equal(findTyposquatCandidate('react', 'npm', 10), null, 'Corpus members stay immune at scale');
    assert.equal(findTyposquatCandidate('experss', 'npm', 10)?.canonical, 'express', 'Generated-corpus entries must catch squats');
  }
  console.log('  ✔ PASS: generated corpus merged, immunity intact, squats caught\n');

  // Test 53: privacy mode corpus-prefill - popular deps verified with zero network
  console.log('Test 53: privacy mode corpus prefill');
  {
    const tempPrivacy = path.resolve('test_temp_privacy');
    fs.mkdirSync(tempPrivacy, { recursive: true });
    fs.writeFileSync(path.join(tempPrivacy, 'app.js'), "import _ from 'react';\nimport z from 'fake-privacy-never-seen-xyz';\n");
    try {
      const privacyResult = await scanDirectory(tempPrivacy, { offline: true });
      const byName = Object.fromEntries(privacyResult.findings.map(f => [f.name, f]));
      assert.equal(byName.react?.status, 'VERIFIED', 'Corpus member must verify offline');
      assert.equal(byName.react?.verifiedVia, 'corpus', 'Popular packages must be verified via bundled corpus');
      assert.equal(byName.react?.risk, 'CLEAN', 'Corpus verification is a clean verdict');
      assert.equal(byName['fake-privacy-never-seen-xyz']?.status, 'UNKNOWN', 'Unknowns stay honestly UNKNOWN');
    } finally {
      fs.rmSync(tempPrivacy, { recursive: true, force: true });
    }
  }
  console.log('  ✔ PASS: privacy mode verifies popular deps offline, never fakes verdicts\n');

  // Test 54: --clear-cache wipes the local cache file
  console.log('Test 54: --clear-cache command');
  {
    const { cacheSet, cacheFlush } = await import('../src/registries/cache.js');
    await cacheSet('test:clear', { name: 'q', risk: 'CLEAN', status: 'VERIFIED' });
    await cacheFlush();
    const clearRun = spawnSync(process.execPath, [path.resolve('bin/slop-deps.js'), '--clear-cache'], { encoding: 'utf-8' });
    assert.equal(clearRun.status, 0, '--clear-cache must exit 0');
    assert.ok(clearRun.stdout.includes('Cache wiped'), '--clear-cache must report the wipe');
    const { cachePath } = await import('../src/registries/cache.js');
    assert.ok(!fs.existsSync(cachePath()), 'Cache file must be gone after wipe');
  }
  console.log('  ✔ PASS: --clear-cache wipes local verdict cache\n');

  // Test 55: Rust ecosystem - use extraction, Cargo.toml, local paths, live crates.io
  console.log('Test 55: Rust ecosystem support');
  const { extractRustUses } = await import('../src/extractors/rust.js');
  const { extractCargoToml } = await import('../src/extractors/manifests.js');
  const rustSrc = [
    'use serde::{Deserialize, Serialize};',
    'use tokio::time::Duration;',
    'extern crate rand;',
    'use crate::models::User;',
    'use self::helpers::foo;',
    'use std::collections::HashMap;'
  ].join('\n');
  const uses = extractRustUses(rustSrc, 'main.rs').map(u => u.name);
  assert.ok(uses.includes('serde') && uses.includes('tokio') && uses.includes('rand'), 'Registry crates must be extracted');
  assert.ok(!uses.includes('crate') && !uses.includes('self'), 'Local use paths must be skipped');
  assert.ok(!uses.includes('std'), 'std must be left to builtins filter');

  const cargoToml = [
    '[package]',
    'name = "demo-rs"',
    '',
    '[dependencies]',
    'serde = { version = "1.0", features = ["derive"] }',
    'local-helper = { path = "../local-helper" }',
    'git-dep = { git = "https://github.com/x/y" }',
    'tokio = "1.0"',
    '',
    '[dev-dependencies]',
    'criterion = "0.5"',
    '',
    '[dependencies.serde_derive]',
    'version = "1.0"'
  ].join('\n');
  const cargoDeps = extractCargoToml(cargoToml, 'Cargo.toml').map(d => d.name);
  assert.ok(cargoDeps.includes('serde') && cargoDeps.includes('tokio'), 'Dependency names must be extracted');
  assert.ok(!cargoDeps.includes('local-helper'), 'Path dependencies must be skipped');
  assert.ok(!cargoDeps.includes('git-dep'), 'Git dependencies must be skipped');
  assert.ok(cargoDeps.includes('criterion'), 'Dev dependencies must be extracted');
  assert.ok(cargoDeps.includes('serde_derive'), 'Inline sub-table dependencies must be extracted');
  assert.ok(!cargoDeps.includes('demo-rs'), 'Own package name must not be a dependency');

  const { checkRustPackage } = await import('../src/registries/rust.js');
  const serdeCheck = await checkRustPackage('serde');
  assert.equal(serdeCheck.risk, 'CLEAN', 'serde must verify clean on crates.io');
  const fakeCrate = await checkRustPackage('serde-magic-hallucinated-xyz-404');
  assert.equal(fakeCrate.status, 'HALLUCINATED', 'Fake crate must be caught');
  console.log('  ✔ PASS: Rust sources, Cargo.toml and live crates.io verification\n');

  // Test 56: BYOK AI fix mode with a mock provider
  console.log('Test 56: BYOK AI fix mode');
  {
    const { buildUserPrompt, parseFixes } = await import('../src/fixer.js');
    const { applyFixes } = await import('../src/fixer.js');

    const tempFix = path.resolve('test_temp_fix');
    fs.mkdirSync(tempFix, { recursive: true });
    const appPath = path.join(tempFix, 'app.js');
    fs.writeFileSync(appPath, "import _ from 'lodaeh';\nimport r from 'react';\n");
    const fixes = parseFixes('```json\n[{"file":"app.js","line":1,"old":"import _ from \'lodaeh\';","new":"import _ from \'lodash\';"}]\n```');
    const results = await applyFixes(tempFix, fixes);
    assert.equal(results.filter(r => r.applied).length, 1, 'The flagged line must be fixed');
    const after = fs.readFileSync(appPath, 'utf-8');
    assert.ok(after.includes("from 'lodash'"), 'File must contain the corrected import');
    assert.ok(after.includes("from 'react'"), 'Untouched lines must stay intact');
    assert.ok(fs.existsSync(appPath + '.slop-deps.bak'), 'A .slop-deps.bak backup must be created');
    fs.rmSync(tempFix, { recursive: true, force: true });

    const prompt = buildUserPrompt('proj', [{ file: 'a.js', line: 1, ecosystem: 'npm', name: 'lodaeh', raw: "import _ from 'lodaeh'", message: 'does not exist' }]);
    assert.ok(prompt.includes('lodaeh') && prompt.includes('JSON'), 'Prompt must carry findings and demand JSON');
    const noOp = parseFixes('[]');
    assert.equal(noOp.length, 0, 'Empty fix arrays must parse cleanly');
  }
  console.log('  ✔ PASS: fixer parses AI output, patches exact lines, keeps backups\n');

  // Test 57: --fix without a key fails closed with guidance
  console.log('Test 57: --fix BYOK gating');
  {
    const fixRun = spawnSync(process.execPath, [path.resolve('bin/slop-deps.js'), '--fix', '--dir', 'src'], {
      encoding: 'utf-8',
      env: { ...process.env, SLOP_AI_KEY: '', OPENAI_API_KEY: '', ANTHROPIC_API_KEY: '' }
    });
    assert.equal(fixRun.status, 2, '--fix without BYOK key must exit 2');
    assert.ok(fixRun.stderr.includes('BYOK'), 'Error must explain the BYOK requirement');
  }
  console.log('  ✔ PASS: --fix fails closed without a key, never silently skips\n');

  // Test 58: CLI argument error handling (rejects invalid options fail-closed)
  console.log('Test 58: CLI fail-closed argument validation');
  {
    const badRun = spawnSync(process.execPath, [path.resolve('bin/slop-deps.js'), '--non-existent-flag'], { encoding: 'utf-8' });
    assert.equal(badRun.status, 2, 'Unrecognized options must exit 2');
    assert.ok(badRun.stderr.includes('Unrecognized option'), 'Error message must specify invalid option');
  }
  console.log('  ✔ PASS: unrecognized options fail-closed with code 2\n');

  // Test 59: Filesystem missing directory path validation
  console.log('Test 59: missing or invalid directory path validation');
  {
    const noDirRun = spawnSync(process.execPath, [path.resolve('bin/slop-deps.js'), '--dir', 'non-existent-directory-xyz-12345'], { encoding: 'utf-8' });
    assert.equal(noDirRun.status, 2, 'Missing target directory must exit 2');
  }
  console.log('  ✔ PASS: missing target directories fail-closed with code 2\n');

    // Test 60: --fix rejects injection-shaped AI rewrites and validates exact result line
  console.log('Test 60: fixer exact-line & injection guard');
  {
    const { applyFixes } = await import('../src/fixer.js');
    const os = await import('node:os');
    const proj = fs.mkdtempSync(path.join(os.tmpdir(), 't60-'));
    fs.writeFileSync(path.join(proj, 'app.js'), "import reqeusts from 'reqeusts';\nimport lodash from 'lodash';\n");
    fs.writeFileSync(path.join(proj, 'app.py'), "import reqeusts\nimport json\n");

    // 1. Terminator mismatch fix must be REJECTED, file byte-unchanged
    const termMismatchFix = [
      { file: 'app.js', line: 1, old: "import reqeusts from 'reqeusts'", new: "import reqeusts from 'requests';" }
    ];
    const mismatchRes = await applyFixes(proj, termMismatchFix);
    assert.equal(mismatchRes[0].applied, false, 'Terminator mismatch fix must be rejected');
    assert.ok(mismatchRes[0].reason && mismatchRes[0].reason.startsWith('rejected'), 'Reject reason must start with rejected');
    const byteUnchanged = fs.readFileSync(path.join(proj, 'app.js'), 'utf-8');
    assert.equal(byteUnchanged, "import reqeusts from 'reqeusts';\nimport lodash from 'lodash';\n", 'File must remain byte-unchanged on rejection');

    // 2. Benign substring fix + injections + benign python fix
    const fixes = [
      // benign: substring fix must apply and keep local typo
      { file: 'app.js', line: 1, old: "'reqeusts'", new: "'requests'" },
      // injection: arbitrary code appended after the specifier
      { file: 'app.js', line: 2, old: "import lodash from 'lodash'", new: "import lodash from 'lodash'; require('child_process').exec('rm -rf /')" },
      // injection: whole-line rewrite
      { file: 'app.js', line: 2, old: "import lodash from 'lodash'", new: "process.exit(1)" },
      // python injection: statement smuggling
      { file: 'app.py', line: 1, old: "import reqeusts", new: "import requests; __import__('os').system('pwned')" },
      // benign python fix
      { file: 'app.py', line: 1, old: "import reqeusts", new: "import requests" },
    ];
    const results = await applyFixes(proj, fixes);
    const byOld = new Map(results.map((r) => [r.old, r]));
    assert.ok(byOld.get("'reqeusts'").applied, 'Substring specifier-only fix must apply');
    assert.equal(byOld.get("'reqeusts'").after, "import reqeusts from 'requests';", 'After field must match exact line');
    assert.ok(!byOld.get("import lodash from 'lodash'; require('child_process').exec('rm -rf /')"), 'sanity');
    const rejected = results.filter((r) => r.reason && r.reason.startsWith('rejected'));
    assert.equal(rejected.length, 3, `Exactly 3 injection-shaped rewrites must be rejected (got ${rejected.length})`);

    const jsContent = fs.readFileSync(path.join(proj, 'app.js'), 'utf-8');
    const firstLine = jsContent.split('\n')[0];
    assert.equal(firstLine, "import reqeusts from 'requests';", 'Resulting file line 1 must equal exactly import reqeusts from \'requests\';');
    assert.ok(!jsContent.includes(';;'), 'File must not contain ;; in any case');
    assert.ok(!jsContent.includes('child_process'), 'Injected code must never land in the file');

    const pyContent = fs.readFileSync(path.join(proj, 'app.py'), 'utf-8');
    assert.ok(!pyContent.includes('pwned'), 'Python statement smuggling must be rejected');
    assert.ok(pyContent.includes('import requests'), 'Benign python fix must be applied');
    assert.ok(!pyContent.includes(';;'), 'Python file must not contain ;; in any case');
    fs.rmSync(proj, { recursive: true, force: true });
  }
  console.log('  ✔ PASS: only specifier-only rewrites pass; terminator mismatch and code injection rejected\n');

  // Test 61: CI workflow must be valid YAML with sane branch filters
  console.log('Test 61: CI workflow sanity');
  {
    const ci = fs.readFileSync(path.resolve('.github/workflows/ci.yml'), 'utf-8');
    assert.ok(!/branches:\s*ain\]/.test(ci), 'ci.yml must not contain the corrupted "ain]" branch filter');
    assert.equal((ci.match(/branches:\s*\[main\]/g) || []).length, 2, 'Both push and pull_request must filter on [main]');
    const action = fs.readFileSync(path.resolve('action.yml'), 'utf-8');
    assert.ok(action.includes('!cancelled()'), 'SARIF upload must use !cancelled() so artifacts survive strict failures');
  }
  console.log('  ✔ PASS: CI triggers on [main]; action uploads SARIF even on strict failure\n');

  // Site-side regression suite (Tests 62..69, 71..76)
  const siteRegScript = path.resolve('fixes/verify/site_regressions.ts');
  const tsxCli = path.resolve('site/morpho/node_modules/tsx/dist/cli.mjs');

  if (!fs.existsSync(tsxCli)) {
    console.error('Site regression tests need site deps: npm ci --prefix site/morpho (see README)');
    process.exit(2);
  }

  const siteTestsPart1 = [
    { num: '62', title: 'Test 62: CDN scoped extraction' },
    { num: '63', title: 'Test 63: Importmap aliases (~ and @/)' },
    { num: '64', title: 'Test 64: TOML headers ([[bin]], [[tool.poetry.source]])' },
    { num: '65', title: 'Test 65: File size limit (>2MB -> FILE TOO LARGE)' },
    { num: '66', title: 'Test 66: Crates verdicts & offline handling' },
    { num: '67', title: 'Test 67: Clean source file (0 external packages)' },
    { num: '68', title: 'Test 68: Requirements flags-only' },
    { num: '69', title: 'Test 69: Scan timeout path' },
  ];

  for (const st of siteTestsPart1) {
    console.log(st.title);
    const res = spawnSync(process.execPath, [tsxCli, siteRegScript, st.num], { encoding: 'utf-8' });
    if (res.status !== 0) {
      console.error(res.stderr || res.stdout);
      throw new Error(`${st.title} failed`);
    }
    process.stdout.write(res.stdout);
  }

  // Test 70: js-ts line number binary search differential parity (§4.10)
  console.log('Test 70: js-ts line number binary-search differential');
  {
    // 1. Multi-line fixture test/app.js
    const appJsCode = fs.readFileSync(path.resolve('test/app.js'), 'utf-8');
    const appJsImports = extractJsImports(appJsCode, 'test/app.js');
    assert.ok(appJsImports.length > 0, 'Must extract imports from test/app.js');

    // 2. Synthetic multi-line fixture with imports at exact known lines
    const knownLines = [
      { line: 1, code: "import alpha from 'alpha';" },
      { line: 42, code: "const beta = require('beta');" },
      { line: 250, code: "import('gamma').then(g => g());" },
      { line: 777, code: "export { delta } from 'delta';" },
      { line: 999, code: "import * as omega from 'omega';" },
    ];
    let fixtureLines = new Array(1000).fill("// dummy padding line");
    for (const k of knownLines) {
      fixtureLines[k.line - 1] = k.code;
    }
    const syntheticFixture = fixtureLines.join('\n');
    const synthImports = extractJsImports(syntheticFixture, 'synthetic.js');
    assert.equal(synthImports.length, 5, 'Must extract all 5 synthetic imports');

    // For every extracted import, assert exact equality with known line AND slice/split
    for (const k of knownLines) {
      const pkgName = k.code.match(/['"](\w+)['"]/)[1];
      const extracted = synthImports.find(p => p.name === pkgName);
      assert.ok(extracted, `Must extract ${pkgName}`);
      assert.equal(extracted.line, k.line, `Line for ${pkgName} must equal exact known line ${k.line}`);
      
      // Compute old slice/split algorithm at the match position
      const matchIdx = syntheticFixture.indexOf(k.code);
      const oldSliceLine = syntheticFixture.slice(0, matchIdx + 1).split('\n').length;
      assert.equal(extracted.line, oldSliceLine, `Binary search line must equal slice/split line for ${pkgName}`);
    }
  }
  console.log('  ✔ PASS: binary-search newline offsets produces 100% identical line numbers to slice/split algorithm\n');

  // Test 71: Pipfile, setup.cfg, .pyi, and .astro manifest parsing (§4.11)
  console.log('Test 71: Pipfile, setup.cfg, .pyi, and .astro manifest parsing');
  {
    const res = spawnSync(process.execPath, [tsxCli, siteRegScript, '71'], { encoding: 'utf-8' });
    if (res.status !== 0) {
      console.error(res.stderr || res.stdout);
      throw new Error('Test 71 failed');
    }
    process.stdout.write(res.stdout);
  }

  // Site-side regression suite Part 2 (Tests 72..76 - Addendum A1, A4, A6, A8, A11)
  const siteTestsPart2 = [
    { num: '72', title: 'Test 72: Inline-script tag attribute isolation (Addendum A1)' },
    { num: '73', title: 'Test 73: PyPI canonical distribution resolution before typosquat check (Addendum A4)' },
    { num: '74', title: 'Test 74: Multi-file retry aggregate cat state transition (Addendum A6)' },
    { num: '75', title: 'Test 75: Installer canonical filename alignment (Addendum A8)' },
    { num: '76', title: 'Test 76: Single formatHeadline definition across site/morpho (Addendum A11)' },
  ];

  for (const st of siteTestsPart2) {
    console.log(st.title);
    const res = spawnSync(process.execPath, [tsxCli, siteRegScript, st.num], { encoding: 'utf-8' });
    if (res.status !== 0) {
      console.error(res.stderr || res.stdout);
      throw new Error(st.title + ' failed');
    }
    process.stdout.write(res.stdout);
  }

  console.log('🎉 All 76 test assertions passed successfully!');
}

run().catch((err) => {
  console.error('\n❌ Test assertion failed:', err.message);
  process.exit(1);
});
