// --fix mode: send hallucinated/typosquatted import findings to a BYOK AI,
// get corrected import statements, apply them with .slop-deps.bak backups.
// Only ever touches the exact import lines flagged by the scanner.

import { promises as fs } from 'fs';
import path from 'path';

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
  return parsed.filter(fx => fx && typeof fx.file === 'string' && typeof fx.old === 'string');
}

export async function applyFixes(targetDir, fixes, { dryRun = false } = {}) {
  const results = [];
  const byFile = new Map();
  for (const fx of fixes) {
    if (!fx.new || typeof fx.new !== 'string') {
      results.push({ ...fx, applied: false, reason: 'no suggestion' });
      continue;
    }
    if (!byFile.has(fx.file)) byFile.set(fx.file, []);
    byFile.get(fx.file).push(fx);
  }

  for (const [relFile, fileFixes] of byFile) {
    const abs = path.resolve(targetDir, relFile);
    let content;
    try {
      content = await fs.readFile(abs, 'utf-8');
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
      await fs.writeFile(`${abs}.slop-deps.bak`, content, 'utf-8');
      await fs.writeFile(abs, lines.join('\n'), 'utf-8');
    }
  }

  return results;
}
