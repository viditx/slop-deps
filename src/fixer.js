// --fix mode: send hallucinated/typosquatted import findings to a BYOK AI,
// get corrected import statements, apply them with .slop-deps.bak backups.
// Only ever touches the exact import lines flagged by the scanner.

import { promises as fs, constants as fsConstants } from 'fs';
import path from 'path';

const PACKAGE_TOKEN = /^[A-Za-z0-9@._/~:+?-]+$/;
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/;

const SYSTEM = `You fix broken package imports in source code. The scanner found imports referencing packages that do not exist on the registry (AI hallucinations) or that typosquat popular packages. For each finding, return the corrected import line: keep the language, style and named bindings identical, only change the package specifier to the real package the code clearly intended. If no real package plausibly matches, set "new" to null. Respond ONLY with a JSON array, no prose, no code fences.`;

export function buildUserPrompt(targetDir, findings) {
  const payload = findings.map(f => ({
    file: f.file,
    line: f.line || null,
    ecosystem: f.ecosystem,
    package: f.name,
    import: f.raw || null,
    scanner_note: f.message || ''
  }));
  return `Project root: ${path.basename(targetDir)}\nFindings:\n${JSON.stringify(payload, null, 2)}\n\nReturn JSON: [{"file":"<same as input>","line":<number>,"old":"<exact current import line>","new":"<corrected import line or null>"}]`;
}

export function parseFixes(text) {
  const jsonText = text.replace(/```(?:json)?/g, '').trim();
  const start = jsonText.indexOf('[');
  const end = jsonText.lastIndexOf(']');
  if (start === -1 || end === -1) throw new Error('AI response contained no JSON array');
  const parsed = JSON.parse(jsonText.slice(start, end + 1));
  if (!Array.isArray(parsed)) throw new Error('AI response was not a JSON array');
  return parsed.filter(fx =>
    fx &&
    typeof fx.file === 'string' &&
    typeof fx.old === 'string' &&
    (fx.line == null || Number.isInteger(fx.line))
  );
}

function safeReplacement(oldText, newText) {
  if (!oldText || !newText || CONTROL_CHARS.test(oldText) || CONTROL_CHARS.test(newText)) return false;
  if (oldText === newText) return false;

  let prefix = 0;
  while (prefix < oldText.length && prefix < newText.length && oldText[prefix] === newText[prefix]) prefix++;
  let suffix = 0;
  while (
    suffix < oldText.length - prefix &&
    suffix < newText.length - prefix &&
    oldText[oldText.length - suffix - 1] === newText[newText.length - suffix - 1]
  ) suffix++;

  const replacement = newText.slice(prefix, newText.length - suffix);
  const original = oldText.slice(prefix, oldText.length - suffix);
  return Boolean(original && replacement && PACKAGE_TOKEN.test(replacement) && !/\s/.test(replacement));
}

function normalizeFile(file) {
  return file.replace(/\\/g, '/').replace(/^\.\/+/, '');
}

function isAllowedFix(fx, findings) {
  if (!Array.isArray(findings) || !Number.isInteger(fx.line)) return false;
  const file = normalizeFile(fx.file);
  return findings.some(finding =>
    Number.isInteger(finding.line) &&
    finding.line === fx.line &&
    normalizeFile(finding.file) === file &&
    typeof finding.raw === 'string' &&
    fx.old.includes(finding.raw)
  );
}

async function validatePathComponents(root, target) {
  const rootReal = await fs.realpath(root);
  const targetReal = await fs.realpath(target);
  const relative = path.relative(rootReal, targetReal);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) return null;

  let current = rootReal;
  for (const component of relative.split(path.sep)) {
    current = path.join(current, component);
    const stat = await fs.lstat(current);
    if (stat.isSymbolicLink()) return null;
  }
  return targetReal;
}

async function writeFileNoFollow(file, data) {
  const flags = fsConstants.O_WRONLY | fsConstants.O_CREAT | fsConstants.O_TRUNC |
    (fsConstants.O_NOFOLLOW || 0);
  const handle = await fs.open(file, flags, 0o666);
  try {
    await handle.writeFile(data, 'utf-8');
  } finally {
    await handle.close();
  }
}

export async function applyFixes(targetDir, fixes, { dryRun = false, findings = [] } = {}) {
  const results = [];
  const byFile = new Map();
  for (const fx of fixes) {
    if (!fx.new || typeof fx.new !== 'string') {
      results.push({ ...fx, applied: false, reason: 'no suggestion' });
      continue;
    }
    if (!safeReplacement(fx.old, fx.new)) {
      results.push({ ...fx, applied: false, reason: 'unsafe replacement' });
      continue;
    }
    if (!isAllowedFix(fx, findings)) {
      results.push({ ...fx, applied: false, reason: 'fix not present in scanner findings' });
      continue;
    }
    if (!byFile.has(fx.file)) byFile.set(fx.file, []);
    byFile.get(fx.file).push(fx);
  }

  for (const [relFile, fileFixes] of byFile) {
    const abs = path.resolve(targetDir, relFile);
    const relative = path.relative(path.resolve(targetDir), abs);
    if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
      for (const fx of fileFixes) results.push({ ...fx, applied: false, reason: 'file outside target directory' });
      continue;
    }
    let safeAbs;
    try {
      const stat = await fs.lstat(abs);
      if (stat.isSymbolicLink()) throw new Error('target file is a symlink');
      safeAbs = await validatePathComponents(targetDir, abs);
      if (!safeAbs) throw new Error('resolved path is outside target directory');
    } catch (err) {
      for (const fx of fileFixes) results.push({ ...fx, applied: false, reason: `unsafe target path: ${err.message}` });
      continue;
    }
    let content;
    try {
      content = await fs.readFile(safeAbs, 'utf-8');
    } catch (err) {
      for (const fx of fileFixes) results.push({ ...fx, applied: false, reason: `read error: ${err.code}` });
      continue;
    }
    const lines = content.split('\n');
    let changed = 0;
    for (const fx of fileFixes) {
      const idx = fx.line && fx.line >= 1 && fx.line <= lines.length ? fx.line - 1
        : lines.findIndex(l => l.includes(fx.old));
      if (idx === -1 || !lines[idx] || !lines[idx].includes(fx.old.trim().slice(0, 20))) {
        results.push({ ...fx, applied: false, reason: 'original line not found' });
        continue;
      }
      const before = lines[idx];
      lines[idx] = lines[idx].replace(fx.old, fx.new);
      if (lines[idx] !== before) {
        changed++;
        results.push({ ...fx, applied: true, line: idx + 1, before, after: lines[idx] });
      } else {
        results.push({ ...fx, applied: false, reason: 'no textual change' });
      }
    }
    if (changed > 0 && !dryRun) {
      await writeFileNoFollow(`${safeAbs}.slop-deps.bak`, content);
      await writeFileNoFollow(safeAbs, lines.join('\n'));
    }
  }

  return results;
}
