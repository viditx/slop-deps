import assert from 'node:assert/strict';
import path from 'node:path';
import { scanDirectory } from '../src/index.js';
import { extractJsImports } from '../src/extractors/js-ts.js';
import { extractPackageJson, extractPyProjectToml, extractSetupCfg } from '../src/extractors/manifests.js';
import { extractPythonImports } from '../src/extractors/python.js';

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

  console.log('🎉 All test assertions passed successfully!');
}

run().catch((err) => {
  console.error('\n❌ Test assertion failed:', err.message);
  process.exit(1);
});
