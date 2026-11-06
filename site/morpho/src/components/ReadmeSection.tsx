import { useState } from 'react';
import { BookOpen, Github, ShieldCheck, Terminal, AlertTriangle, Layers } from 'lucide-react';
import { CatState, PixelSittingCat } from './PixelSittingCat';

const GITHUB_REPO_URL = 'https://github.com/viditx/slop-deps';
const VERSION = 'v1.4.0';

type Tab = 'overview' | 'threats' | 'security';

export function ReadmeSection() {
  const [activeTab, setActiveTab] = useState<Tab>('overview');
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText('npx slop-deps');
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    } catch {
      // Clipboard unavailable
    }
  };

  return (
    <section
      id="readme-section"
      data-testid="readme-section"
      className="relative w-full max-w-[720px] mx-auto px-4"
    >
      {/* Tab bar header */}
      <div className="flex items-end justify-between gap-2 mb-[-2px] px-1">
        <div className="flex items-center gap-1.5 sm:gap-2">
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#080A0F] border-2 border-b-0 border-[#F5F5F0]/30 font-pixel text-[10px] uppercase tracking-[0.08em] text-[#F5F5F0]">
            <BookOpen aria-hidden="true" className="w-3.5 h-3.5" strokeWidth={2.5} />
            <span>readme.md</span>
          </span>
          <span className="hidden sm:inline font-terminal text-[11px] text-[#F5F5F0]/40">
            {VERSION}
          </span>
        </div>

        {/* Minimal segmented navigation */}
        <div className="flex items-center gap-1 bg-[#040507] p-1 border border-[#F5F5F0]/20 pixel-pill-clip">
          <button
            type="button"
            onClick={() => setActiveTab('overview')}
            className={`px-2.5 py-1 font-pixel text-[9px] uppercase tracking-[0.06em] transition-all cursor-pointer ${
              activeTab === 'overview'
                ? 'bg-[#F5F5F0] text-[#080A0F] font-bold'
                : 'text-[#F5F5F0]/60 hover:text-[#F5F5F0]'
            }`}
          >
            overview
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('threats')}
            className={`px-2.5 py-1 font-pixel text-[9px] uppercase tracking-[0.06em] transition-all cursor-pointer ${
              activeTab === 'threats'
                ? 'bg-[#F5F5F0] text-[#080A0F] font-bold'
                : 'text-[#F5F5F0]/60 hover:text-[#F5F5F0]'
            }`}
          >
            threat matrix
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('security')}
            className={`px-2.5 py-1 font-pixel text-[9px] uppercase tracking-[0.06em] transition-all cursor-pointer ${
              activeTab === 'security'
                ? 'bg-[#F5F5F0] text-[#080A0F] font-bold'
                : 'text-[#F5F5F0]/60 hover:text-[#F5F5F0]'
            }`}
          >
            security
          </button>
        </div>
      </div>

      {/* Main Card */}
      <div className="pixel-card-clip border-2 border-[#F5F5F0]/30 bg-[#080A0F] p-5 sm:p-6 flex flex-col gap-5">
        
        {/* Top bar: title + cat */}
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="font-pixel text-lg sm:text-xl text-[#F5F5F0] tracking-[0.04em]">
                slop-deps
              </h2>
              <span className="pixel-pill-clip px-2 py-0.5 border border-[#F5F5F0]/25 bg-[#040507] font-pixel text-[8px] uppercase tracking-[0.06em] text-[#F5F5F0]/70">
                sentinel
              </span>
            </div>
            <p
              data-testid="readme-pitch"
              className="mt-1 font-terminal text-xs sm:text-[13px] text-[#F5F5F0]/80 leading-snug"
            >
              Catches fake packages invented by AI before they reach your lockfile.
            </p>
          </div>

          {/* Resident Cat (scaled down neatly) */}
          <div
            data-testid="readme-guard-cat"
            className="relative shrink-0 w-12 h-11 sm:w-16 sm:h-14"
            title="Resident Cat"
          >
            <div className="absolute top-0 right-0 origin-top-right scale-[0.38] sm:scale-[0.48]">
              <PixelSittingCat state={CatState.Purring} />
            </div>
          </div>
        </div>

        {/* TAB 1: OVERVIEW */}
        {activeTab === 'overview' && (
          <div className="flex flex-col gap-4 animate-context-item-in">
            {/* Quick Command Box */}
            <div className="flex flex-wrap items-center justify-between gap-2.5 bg-[#040507] border border-[#F5F5F0]/20 p-2.5 sm:px-3.5">
              <div className="flex items-center gap-2 font-terminal text-xs sm:text-sm text-[#F5F5F0]">
                <Terminal className="w-3.5 h-3.5 text-emerald-400" />
                <span>$ npx slop-deps</span>
                <span className="text-[#F5F5F0]/40 text-[11px] hidden sm:inline">
                  or: slopdeps &lt;dir&gt;
                </span>
              </div>
              <button
                type="button"
                data-testid="readme-npx-chip"
                onClick={() => void handleCopy()}
                className="px-2.5 py-1 bg-[#F5F5F0]/15 hover:bg-[#F5F5F0]/30 font-pixel text-[9px] uppercase text-[#F5F5F0] pixel-pill-clip pixel-btn-anim cursor-pointer transition-colors"
              >
                {copied ? 'copied' : 'copy'}
              </button>
            </div>

            {/* 3-Tier Status Strip (Sleek Horizontal) */}
            <div
              data-testid="readme-tier-table"
              className="grid grid-cols-1 sm:grid-cols-3 gap-2"
            >
              <div className="border border-[#FB7185]/30 bg-[#FB7185]/5 p-2.5 flex flex-col gap-0.5">
                <div className="flex items-center justify-between">
                  <span className="font-terminal text-xs font-bold text-[#FB7185]">
                    HALLUCINATED
                  </span>
                  <span className="font-pixel text-[8px] uppercase px-1 border border-[#FB7185]/40 text-[#FB7185]">
                    critical
                  </span>
                </div>
                <p className="font-terminal text-[11px] text-[#F5F5F0]/65 leading-tight">
                  Package does not exist. Immediate hijack hazard.
                </p>
              </div>

              <div className="border border-[#FCD34D]/30 bg-[#FCD34D]/5 p-2.5 flex flex-col gap-0.5">
                <div className="flex items-center justify-between">
                  <span className="font-terminal text-xs font-bold text-[#FCD34D]">
                    SUSPICIOUS
                  </span>
                  <span className="font-pixel text-[8px] uppercase px-1 border border-[#FCD34D]/40 text-[#FCD34D]">
                    high
                  </span>
                </div>
                <p className="font-terminal text-[11px] text-[#F5F5F0]/65 leading-tight">
                  Typosquat / lookalike of a popular dependency.
                </p>
              </div>

              <div className="border border-emerald-400/30 bg-emerald-400/5 p-2.5 flex flex-col gap-0.5">
                <div className="flex items-center justify-between">
                  <span className="font-terminal text-xs font-bold text-emerald-400">
                    VERIFIED
                  </span>
                  <span className="font-pixel text-[8px] uppercase px-1 border border-emerald-400/40 text-emerald-400">
                    clean
                  </span>
                </div>
                <p className="font-terminal text-[11px] text-[#F5F5F0]/65 leading-tight">
                  Established package with verified release history.
                </p>
              </div>
            </div>

            {/* Micro spec tokens */}
            <div className="flex flex-wrap items-center gap-1.5 font-terminal text-[11px] text-[#F5F5F0]/60 pt-1">
              <span className="text-[#F5F5F0]/85 font-medium">npm · PyPI · crates.io</span>
              <span className="text-[#F5F5F0]/25">/</span>
              <span>zero dependencies</span>
              <span className="text-[#F5F5F0]/25">/</span>
              <span>Node &gt;= 18</span>
              <span className="text-[#F5F5F0]/25">/</span>
              <span>offline corpus ready</span>
            </div>
          </div>
        )}

        {/* TAB 2: THREAT MATRIX */}
        {activeTab === 'threats' && (
          <div className="flex flex-col gap-3.5 animate-context-item-in">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <div className="border border-[#FB7185]/30 bg-[#FB7185]/5 px-3 py-2.5">
                <span
                  data-testid="readme-stat-percent"
                  className="font-pixel text-base text-[#FB7185]"
                >
                  5–21%
                </span>
                <p className="mt-0.5 font-terminal text-[11px] text-[#F5F5F0]/70 leading-snug">
                  AI-suggested package names (Cursor, Copilot, Claude) that do not exist anywhere.
                </p>
              </div>
              <div className="border border-[#FCD34D]/30 bg-[#FCD34D]/5 px-3 py-2.5">
                <span
                  data-testid="readme-stat-repeat"
                  className="font-pixel text-base text-[#FCD34D]"
                >
                  43%
                </span>
                <p className="mt-0.5 font-terminal text-[11px] text-[#F5F5F0]/70 leading-snug">
                  Hallucinated names repeat across runs, creating prime slopsquatting targets.
                </p>
              </div>
            </div>

            <div className="border border-[#F5F5F0]/15 bg-[#040507] p-3 font-terminal text-xs text-[#F5F5F0]/75 leading-relaxed">
              <p>
                <strong className="text-[#F5F5F0]">Attack Surface:</strong> Attackers monitor LLM outputs, register the non-existent package names on public registries, and wait for unsuspecting developers to run <code className="text-emerald-400">npm install</code> or <code className="text-emerald-400">pip install</code>.
              </p>
            </div>
          </div>
        )}

        {/* TAB 3: SECURITY */}
        {activeTab === 'security' && (
          <div
            data-testid="readme-security-block"
            className="flex flex-col gap-3 animate-context-item-in"
          >
            <div className="border border-emerald-400/30 bg-emerald-400/5 p-3 flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span className="font-pixel text-xs text-emerald-400 uppercase tracking-[0.06em]">
                  Red-Teamed Architecture
                </span>
                <span className="font-terminal text-xs text-emerald-400 font-bold">
                  61/61 Tests Green
                </span>
              </div>
              <p className="font-terminal text-[11px] text-[#F5F5F0]/75 leading-snug">
                Pure headless execution. Zero open ports, zero listening sockets, zero telemetry, and fail-closed CI exits (code 1 on hallucination, code 2 on error).
              </p>
            </div>

            <div className="flex flex-wrap gap-1.5 font-pixel text-[8px] uppercase tracking-[0.05em] text-[#F5F5F0]/70">
              {['zero open ports', 'fail-closed exits', 'air-gapped mode', 'injection-guarded', 'zero telemetry'].map(
                (c) => (
                  <span key={c} className="px-2 py-0.5 border border-[#F5F5F0]/20 bg-[#040507]">
                    {c}
                  </span>
                )
              )}
            </div>
          </div>
        )}

      </div>
    </section>
  );
}
