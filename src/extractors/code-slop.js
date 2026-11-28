// AI placeholder ("code slop") extractor.
// A single-pass lexer separates real comments from string-literal contents, so
// TODO markers inside strings, URLs, or template interpolation never produce
// false positives. Rules then run over the lexed output in O(n).

const TODO_RE = /\btodo\b/i;

const ELLIPSIS_WORDS_RE = /(?:rest\s+of\s+(?:the\s+)?(?:code|implementation)|remaining\s+(?:code|implementation|logic)|implementation\s+(?:goes\s+)?here|code\s+(?:goes\s+)?here|logic\s+(?:goes\s+)?here|omitted\s+for\s+brevity|your\s+code\s+here|fill\s+in\s+(?:the\s+)?(?:implementation|logic|details)|to\s+be\s+implemented)/i;

// Reserved word: only a statement (or a label/property, excluded below).
const DEBUGGER_RE = /(?<![.\w$])debugger\s*;?(?![\w$:])/;
const RAISE_NIE_RE = /\braise\s+notimplementederror\b/i;
const PASS_RE = /^\s*pass\b/;

const KIND_MESSAGE = {
  'todo-comment': 'Placeholder comment (TODO) left in committed code',
  'ellipsis-placeholder': 'Truncated implementation placeholder — code body omitted',
  'pass-stub': 'Stub body `pass` carrying a TODO marker — not implemented',
  'not-implemented': '`raise NotImplementedError` — unimplemented code path',
  'debugger': '`debugger` statement committed — halts execution when devtools are open'
};

// Regex-literal guard: decide whether a `/` opens a regex (not division) by
// scanning back over the already-lexed code stream.
function isRegexStart(out) {
  let j = out.length - 1;
  while (j >= 0 && (out[j] === ' ' || out[j] === '\n' || out[j] === '\t' || out[j] === '\r')) j--;
  if (j < 0) return true;
  if (/[=,;:(\[{!&|?+\-*%^~<>]/.test(out[j])) return true;
  const wordEnd = j;
  while (j >= 0 && /[a-zA-Z0-9_$]/.test(out[j])) j--;
  const word = out.slice(j + 1, wordEnd + 1).join('');
  return /^(?:return|case|throw|yield|await|typeof|void|delete|instanceof|in|of)$/.test(word);
}

// Splits source into blanked code (strings/comments removed, newlines kept)
// and a comment list [{ text, line }]. isPy selects Python lexing
// (triple quotes, # comments, no regex literals).
function lex(source, isPy) {
  const out = [];
  const comments = [];
  const end = source.length;
  let line = 1;
  let i = 0;
  let state = 'code';   // code | line | block | str | triple
  let quote = '';
  let comment = null;

  while (i < end) {
    const ch = source[i];

    if (state === 'line') {
      if (ch === '\n') {
        comments.push(comment);
        comment = null;
        state = 'code';
        out.push('\n');
        line++;
        i++;
        continue;
      }
      comment.text += ch;
      i++;
      continue;
    }

    if (state === 'block') {
      if (ch === '*' && source[i + 1] === '/') {
        comments.push(comment);
        comment = null;
        state = 'code';
        out.push(' ');
        i += 2;
        continue;
      }
      if (ch === '\n') {
        comment.text += '\n';
        out.push('\n');
        line++;
        i++;
        continue;
      }
      comment.text += ch;
      i++;
      continue;
    }

    if (state === 'str') {
      if (ch === '\\') {
        if (source[i + 1] === '\n') {
          out.push('\n');
          line++;
        } else {
          out.push(' ', ' ');
        }
        i += 2;
        continue;
      }
      if (ch === '\n') {
        out.push('\n');
        line++;
        i++;
        continue;
      }
      if (ch === quote) {
        state = 'code';
        out.push(ch);
        i++;
        continue;
      }
      out.push(' ');
      i++;
      continue;
    }

    if (state === 'triple') {
      if (ch === quote && source[i + 1] === quote && source[i + 2] === quote) {
        state = 'code';
        out.push('   ');
        i += 3;
        continue;
      }
      if (ch === '\n') {
        out.push('\n');
        line++;
      }
      i++;
      continue;
    }

    // ---- code state
    if (ch === '\n') {
      out.push('\n');
      line++;
      i++;
      continue;
    }

    if (isPy) {
      if (ch === '#') {
        comment = { text: '', line };
        state = 'line';
        i++;
        continue;
      }
      if ((ch === '"' || ch === '\'') && source[i + 1] === ch && source[i + 2] === ch) {
        quote = ch;
        state = 'triple';
        out.push('   ');
        i += 3;
        continue;
      }
    } else {
      if (ch === '/' && source[i + 1] === '/') {
        comment = { text: '', line };
        state = 'line';
        i += 2;
        continue;
      }
      if (ch === '/' && source[i + 1] === '*') {
        comment = { text: '', line };
        state = 'block';
        i += 2;
        continue;
      }
    }

    if (ch === '"' || ch === '\'' || (!isPy && ch === '`')) {
      quote = ch;
      state = 'str';
      out.push(ch);
      i++;
      continue;
    }

    if (!isPy && ch === '/' && isRegexStart(out)) {
      // Scan-then-commit: only treat as regex if it closes on the same line.
      let j = i + 1;
      let closed = false;
      while (j < end) {
        const r = source[j];
        if (r === '\\') { j += 2; continue; }
        if (r === '\n') break;
        if (r === '/') { closed = true; break; }
        j++;
      }
      if (closed) {
        for (let k = i; k <= j; k++) out.push(' ');
        i = j + 1;
        continue;
      }
    }

    out.push(ch);
    i++;
  }

  if (comment) comments.push(comment); // unterminated line/block comment at EOF

  return { code: out.join(''), comments };
}

function countNewlines(text, from, to) {
  let n = 0;
  for (let k = from; k < to; k++) {
    if (text[k] === '\n') n++;
  }
  return n;
}

export function extractCodeSlop(sourceCode, filePath = '') {
  const isPy = /\.(py|pyi)$/i.test(filePath);
  const { code, comments } = lex(sourceCode, isPy);

  // candidates: { kind, line, commentLine } — commentLine drives pass-stub dedupe
  const candidates = [];

  // Comment rules — at most one finding per comment (TODO wins over ellipsis).
  for (const c of comments) {
    const todoIdx = c.text.search(TODO_RE);
    if (todoIdx !== -1) {
      candidates.push({ kind: 'todo-comment', line: c.line + countNewlines(c.text, 0, todoIdx), commentLine: c.line });
      continue;
    }
    const trimmed = c.text.trim();
    const ellipsisIdx = ELLIPSIS_WORDS_RE.exec(c.text);
    if (trimmed.startsWith('...') || trimmed.startsWith('…') || ellipsisIdx) {
      const line = (!trimmed.startsWith('...') && !trimmed.startsWith('…') && ellipsisIdx)
        ? c.line + countNewlines(c.text, 0, ellipsisIdx.index)
        : c.line;
      candidates.push({ kind: 'ellipsis-placeholder', line, commentLine: c.line });
    }
  }

  // Code rules
  const codeLines = code.split('\n');
  const commentsByLine = new Map();
  for (const c of comments) {
    if (!commentsByLine.has(c.line)) commentsByLine.set(c.line, c);
  }
  for (let li = 0; li < codeLines.length; li++) {
    const ln = li + 1;
    const text = codeLines[li];
    if (!isPy && DEBUGGER_RE.test(text)) {
      candidates.push({ kind: 'debugger', line: ln, commentLine: -1 });
    }
    if (isPy && RAISE_NIE_RE.test(text)) {
      candidates.push({ kind: 'not-implemented', line: ln, commentLine: -1 });
    }
    if (isPy && PASS_RE.test(text)) {
      const c = commentsByLine.get(ln);
      if (c && (TODO_RE.test(c.text) || ELLIPSIS_WORDS_RE.test(c.text))) {
        candidates.push({ kind: 'pass-stub', line: ln, commentLine: ln });
      }
    }
  }

  // A `pass # TODO` line reports once as pass-stub, not twice.
  const stubbedLines = new Set(candidates.filter(f => f.kind === 'pass-stub').map(f => f.commentLine));
  const final = candidates.filter(f => f.kind === 'pass-stub' || !stubbedLines.has(f.commentLine));

  const srcLines = sourceCode.split('\n');
  return final.map(f => ({
    name: f.kind,
    type: 'code-slop',
    ecosystem: 'code-slop',
    file: filePath,
    line: f.line,
    raw: (srcLines[f.line - 1] || '').trim().slice(0, 120),
    status: 'SLOP',
    risk: 'WARN',
    exists: null,
    message: KIND_MESSAGE[f.kind]
  }));
}
