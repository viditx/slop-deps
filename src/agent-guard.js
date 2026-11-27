import fs from 'fs';
import path from 'path';

export const GUARD_START = '<!-- SLOP-DEPS:AI-GUARD:START -->';
export const GUARD_END = '<!-- SLOP-DEPS:AI-GUARD:END -->';

export function buildAgentInstructions(blockedPackages = []) {
  const uniqueNames = [...new Map(blockedPackages.map(p => [p.name.toLowerCase(), p])).values()];
  const pkgList = uniqueNames.length > 0
    ? `\n### ⚠️ BLOCKED HALLUCINATED PACKAGES (DO NOT IMPORT OR INSTALL):\nThe following package(s) were flagged as NON-EXISTENT on public registries and MUST NOT be used:\n${uniqueNames.map(p => `- \`${p.name}\` (${p.ecosystem || 'npm'})`).join('\n')}\n`
    : '';

  return `${GUARD_START}
## 🛡️ AI Agent Dependency Safety Guard (Enforced by slop-deps)

CRITICAL INSTRUCTIONS FOR ALL AI CODING AGENTS (Cursor, Claude Code, Copilot, Antigravity, Windsurf):
${pkgList}
MANDATORY RULES:
1. NEVER invent, hallucinate, or assume a package exists on public registries.
2. Before adding any dependency to manifests or executing an install command (\`npm install\`, \`pip install\`, \`cargo add\`):
   You MUST verify package existence first via the CLI:
   \`npx slop-deps check <package-name>\`
3. If \`slop-deps check\` exits with code 1 (HALLUCINATED/CRITICAL), DO NOT install it. Search for an established legitimate package or write standard library code.
4. Git pre-commit enforcement is active: commits referencing unverified foreign packages will be rejected fail-closed.
${GUARD_END}`;
}

export function updateAgentSystemInstructions(targetDir = process.cwd(), blockedPackages = []) {
  let targetFile = path.join(targetDir, 'SYSTEM.md');
  const lowerFile = path.join(targetDir, 'system.md');
  if (!fs.existsSync(targetFile) && fs.existsSync(lowerFile)) {
    targetFile = lowerFile;
  }

  const newBlock = buildAgentInstructions(blockedPackages);

  try {
    if (fs.existsSync(targetFile)) {
      let content = fs.readFileSync(targetFile, 'utf-8');
      const startIdx = content.indexOf(GUARD_START);
      const endIdx = content.indexOf(GUARD_END);

      if (startIdx !== -1 && endIdx !== -1) {
        content = content.slice(0, startIdx) + newBlock + content.slice(endIdx + GUARD_END.length);
      } else {
        content = `${content.trim()}\n\n${newBlock}\n`;
      }
      fs.writeFileSync(targetFile, content, 'utf-8');
    } else {
      fs.writeFileSync(targetFile, `${newBlock}\n`, 'utf-8');
    }
    const rel = path.relative(targetDir, targetFile);
    return { success: true, file: rel || path.basename(targetFile), path: targetFile };
  } catch (err) {
    return { success: false, error: err.message };
  }
}
