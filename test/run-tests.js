import assert from 'node:assert/strict';
import path from 'node:path';
import { scanDirectory } from '../src/index.js';

async function run() {
  console.log('🧪 Running slop-deps test suite...\n');

  // Test 1: Self-scan src/ must have zero foreign dependencies
  console.log('Test 1: Self-scan src/ (must be 100% clean, zero foreign deps)');
  const srcResult = await scanDirectory(path.resolve('src'));
  assert.equal(srcResult.stats.critical, 0, 'src/ must have 0 critical findings');
  assert.equal(srcResult.stats.total, 0, 'src/ must have 0 external dependencies');
  console.log('  ✔ PASS: src/ contains zero external dependencies\n');

  // Test 2: Scan test fixtures
  console.log('Test 2: Scan test fixtures directory (must catch exactly 4 hallucinated packages)');
  const testResult = await scanDirectory(path.resolve('test'));

  assert.equal(testResult.stats.critical, 4, `Expected exactly 4 critical hallucinations, got ${testResult.stats.critical}`);
  assert.equal(testResult.stats.clean, 9, `Expected exactly 9 verified legit packages, got ${testResult.stats.clean}`);

  const criticalNames = new Set(
    testResult.findings.filter(f => f.risk === 'CRITICAL').map(f => f.name)
  );

  assert.ok(criticalNames.has('react-magic-super-spring-hallucinated-xyz-123'), 'Missing npm code hallucination');
  assert.ok(criticalNames.has('torch_magic_nonexistent_tensor_404'), 'Missing pypi code hallucination');
  assert.ok(criticalNames.has('fake-dev-hallucinated-xyz-999'), 'Missing package.json devDependencies hallucination');
  assert.ok(criticalNames.has('fake-pyproject-hallucinated-xyz-888'), 'Missing pyproject.toml hallucination');

  console.log('  ✔ PASS: All 4 hallucinated fixtures caught across JS, Python, package.json, pyproject.toml\n');

  // Test 3: Verify workspace, local files, and URLs were NOT treated as registry packages
  console.log('Test 3: Verify ignore list for local workspaces and URLs');
  const allNames = new Set(testResult.findings.map(f => f.name));
  assert.ok(!allNames.has('internal-ui'), 'Workspace dependency must be ignored');
  assert.ok(!allNames.has('local-helper'), 'File dependency must be ignored');
  assert.ok(!allNames.has('git'), 'Git URL must not be extracted as package');
  assert.ok(!allNames.has('https'), 'HTTPS URL must not be extracted as package');
  assert.ok(!allNames.has('fake_docstring_package_xyz'), 'Docstring imports must be ignored');
  assert.ok(!allNames.has('fake_inline_comment_pkg'), 'Inline comment imports must be ignored');
  console.log('  ✔ PASS: Workspaces, URLs, docstrings, and comments successfully ignored\n');

  console.log('🎉 All test assertions passed successfully!');
}

run().catch((err) => {
  console.error('\n❌ Test assertion failed:', err.message);
  process.exit(1);
});
