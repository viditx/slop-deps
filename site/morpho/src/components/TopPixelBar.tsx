import { useEffect, useRef, useState } from 'react';

const GITHUB_REPO_URL = 'https://github.com/viditx/slop-deps';

export function PixelDownloadIcon({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 16 16"
      shapeRendering="crispEdges"
      className={className}
      fill="currentColor"
      aria-hidden="true"
    >
      <rect x="7" y="2" width="2" height="7" />
      <rect x="4" y="6" width="2" height="2" />
      <rect x="10" y="6" width="2" height="2" />
      <rect x="5" y="8" width="6" height="2" />
      <rect x="7" y="10" width="2" height="1" />
      <rect x="2" y="11" width="2" height="3" />
      <rect x="12" y="11" width="2" height="3" />
      <rect x="2" y="13" width="12" height="2" />
    </svg>
  );
}

export function PixelUserIcon({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 16 16"
      shapeRendering="crispEdges"
      className={className}
      fill="currentColor"
      aria-hidden="true"
    >
      <rect x="6" y="2" width="4" height="1" />
      <rect x="5" y="3" width="6" height="4" />
      <rect x="6" y="7" width="4" height="1" />
      <rect x="4" y="9" width="8" height="2" />
      <rect x="3" y="11" width="10" height="3" />
    </svg>
  );
}

export function PixelCheckIcon({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 16 16"
      shapeRendering="crispEdges"
      className={className}
      fill="currentColor"
      aria-hidden="true"
    >
      <rect x="12" y="4" width="2" height="2" />
      <rect x="10" y="6" width="2" height="2" />
      <rect x="8" y="8" width="2" height="2" />
      <rect x="6" y="10" width="2" height="2" />
      <rect x="4" y="8" width="2" height="2" />
      <rect x="2" y="6" width="2" height="2" />
    </svg>
  );
}

export function PixelImageFrameIcon({ className = 'w-5 h-5' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 16 16"
      shapeRendering="crispEdges"
      className={className}
      fill="currentColor"
      aria-hidden="true"
    >
      <rect x="2" y="2" width="12" height="1" />
      <rect x="2" y="13" width="12" height="1" />
      <rect x="2" y="2" width="1" height="12" />
      <rect x="13" y="2" width="1" height="12" />
      <rect x="5" y="5" width="2" height="2" />
      <rect x="9" y="8" width="2" height="2" />
      <rect x="7" y="10" width="6" height="2" />
      <rect x="4" y="11" width="4" height="1" />
    </svg>
  );
}

export function PixelCloseIcon({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 16 16"
      shapeRendering="crispEdges"
      className={className}
      fill="currentColor"
      aria-hidden="true"
    >
      <rect x="3" y="3" width="2" height="2" />
      <rect x="5" y="5" width="2" height="2" />
      <rect x="7" y="7" width="2" height="2" />
      <rect x="9" y="9" width="2" height="2" />
      <rect x="11" y="11" width="2" height="2" />
      <rect x="11" y="3" width="2" height="2" />
      <rect x="9" y="5" width="2" height="2" />
      <rect x="5" y="9" width="2" height="2" />
      <rect x="3" y="11" width="2" height="2" />
    </svg>
  );
}

type ContextAnimState = 'closed' | 'open' | 'closing';

interface TopPixelBarProps {
  visible: boolean;
  docked?: boolean;
  customImageSrc?: string;
}

export function TopPixelBar({ visible, docked, customImageSrc }: TopPixelBarProps) {
  const [aboutState, setAboutState] = useState<ContextAnimState>('closed');
  const [downloadState, setDownloadState] = useState<ContextAnimState>('closed');
  const [copiedCmd, setCopiedCmd] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);

  const aboutTimerRef = useRef<number | null>(null);
  const downloadTimerRef = useRef<number | null>(null);
  const aboutPopoverRef = useRef<HTMLDivElement | null>(null);
  const downloadPopoverRef = useRef<HTMLDivElement | null>(null);
  const aboutBtnRef = useRef<HTMLButtonElement | null>(null);
  const aboutBtnMobileRef = useRef<HTMLButtonElement | null>(null);
  const downloadBtnRef = useRef<HTMLAnchorElement | null>(null);

  useEffect(() => {
    const onScroll = () => {
      const sy = window.scrollY || 0;
      setIsScrolled(sy > 25);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const closeAboutContext = () => {
    setAboutState((prev) => {
      if (prev !== 'open') return prev;
      if (aboutTimerRef.current) window.clearTimeout(aboutTimerRef.current);
      aboutTimerRef.current = window.setTimeout(() => {
        setAboutState('closed');
      }, 175);
      return 'closing';
    });
  };

  const openAboutContext = () => {
    if (aboutTimerRef.current) window.clearTimeout(aboutTimerRef.current);
    setAboutState('open');
  };

  const closeDownloadContext = () => {
    setDownloadState((prev) => {
      if (prev !== 'open') return prev;
      if (downloadTimerRef.current) window.clearTimeout(downloadTimerRef.current);
      downloadTimerRef.current = window.setTimeout(() => {
        setDownloadState('closed');
      }, 175);
      return 'closing';
    });
  };

  const openDownloadContext = () => {
    if (downloadTimerRef.current) window.clearTimeout(downloadTimerRef.current);
    setDownloadState('open');
  };

  const toggleAbout = () => {
    if (aboutState === 'open') {
      closeAboutContext();
    } else {
      if (downloadState === 'open') closeDownloadContext();
      openAboutContext();
    }
  };

  const toggleDownload = () => {
    if (downloadState === 'open') {
      closeDownloadContext();
    } else {
      if (aboutState === 'open') closeAboutContext();
      openDownloadContext();
    }
  };

  useEffect(() => {
    if (aboutState === 'closed' && downloadState === 'closed') return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (aboutState === 'open') closeAboutContext();
        if (downloadState === 'open') closeDownloadContext();
      }
    };

    const handlePointerDown = (e: MouseEvent) => {
      const target = e.target as Node | null;
      if (!target) return;

      if (
        aboutState === 'open' &&
        !aboutPopoverRef.current?.contains(target) &&
        !aboutBtnRef.current?.contains(target) &&
        !aboutBtnMobileRef.current?.contains(target)
      ) {
        closeAboutContext();
      }

      if (
        downloadState === 'open' &&
        !downloadPopoverRef.current?.contains(target) &&
        !downloadBtnRef.current?.contains(target)
      ) {
        closeDownloadContext();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('mousedown', handlePointerDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('mousedown', handlePointerDown);
    };
  }, [aboutState, downloadState]);

  useEffect(() => {
    return () => {
      if (aboutTimerRef.current) window.clearTimeout(aboutTimerRef.current);
      if (downloadTimerRef.current) window.clearTimeout(downloadTimerRef.current);
    };
  }, []);

  const handleCopyCli = async () => {
    try {
      await navigator.clipboard.writeText('slopdeps');
      setCopiedCmd(true);
      setTimeout(() => setCopiedCmd(false), 1800);
    } catch {
      setCopiedCmd(true);
      setTimeout(() => setCopiedCmd(false), 1800);
    }
  };

  const isAboutActive = aboutState === 'open';
  const isDownloadActive = downloadState === 'open';

  return (
    <>
      {/* Fixed Header Glass Backdrop (z-20, sits behind canvas so docked particles shine through crisp and bright) */}
      <div
        aria-hidden="true"
        className={`fixed top-0 inset-x-0 h-13 sm:h-16 z-20 transition-all duration-300 pointer-events-none ${
          isScrolled
            ? 'bg-[#040507]/90 backdrop-blur-md border-b border-[#F5F5F0]/10 shadow-[0_10px_30px_rgba(0,0,0,0.6)] opacity-100'
            : 'bg-transparent border-b border-transparent opacity-0'
        }`}
      />

      <header
        data-testid="top-pixel-bar"
        className={`fixed top-0 inset-x-0 z-30 flex items-center justify-between px-3.5 sm:px-6 md:px-10 py-2.5 sm:py-5 transition-all duration-300 pointer-events-none ${
          visible
            ? 'opacity-100 translate-y-0'
            : 'opacity-0 -translate-y-3'
        }`}
      >
        {/* Top-left Logo / Alpha Badge Area */}
        <div className="flex items-center gap-1.5 sm:gap-2.5 shrink-0 whitespace-nowrap pointer-events-auto">
          <span
            data-testid="brand-wordmark"
            className="font-pixel text-[11px] sm:text-xs md:text-sm uppercase tracking-[0.1em] text-[#F5F5F0]/90 whitespace-nowrap select-none opacity-0 pointer-events-none"
          >
            slop-deps
          </span>
          <span
            data-testid="alpha-badge"
            className={`px-1 sm:px-1.5 py-0.5 border border-[#F5F5F0]/40 bg-[#080A0F] font-pixel text-[8px] sm:text-[9px] uppercase tracking-[0.08em] text-[#F5F5F0] whitespace-nowrap select-none transition-opacity duration-300 ${
              docked ? 'opacity-100' : 'opacity-0 pointer-events-none'
            }`}
          >
            alpha
          </span>
        </div>

        {/* Right Cluster: About + GitHub Octocat + Download */}
        <div className="flex items-center justify-end gap-1.5 sm:gap-2.5 shrink-0 pointer-events-auto">
          {/* About Me Pill (responsive text: 'about' on mobile, 'about me' on sm+) */}
          <button
            ref={aboutBtnRef}
            type="button"
            data-testid="about-me-pill"
            aria-expanded={isAboutActive}
            onClick={toggleAbout}
            className={`group relative inline-flex items-center p-[2px] pixel-pill-clip pixel-btn-anim cursor-pointer whitespace-nowrap shrink-0 min-h-[36px] sm:min-h-0 ${
              isAboutActive
                ? 'bg-[#F5F5F0]'
                : 'bg-[#F5F5F0]/35 hover:bg-[#F5F5F0]'
            }`}
          >
            <span
              className={`pixel-btn-sheen inline-flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-4 py-1.5 sm:py-2 font-pixel text-[10px] sm:text-xs uppercase tracking-[0.08em] pixel-pill-clip transition-colors duration-150 ${
                isAboutActive
                  ? 'bg-[#121621] text-[#F5F5F0]'
                  : 'bg-[#080A0F] text-[#F5F5F0]'
              }`}
            >
              <PixelUserIcon
                className={`w-3 sm:w-3.5 h-3 sm:h-3.5 transition-transform duration-150 ${
                  isAboutActive
                    ? 'text-[#F5F5F0] -translate-y-0.5'
                    : 'text-[#F5F5F0]/80 group-hover:text-[#F5F5F0] group-hover:-translate-y-0.5'
                }`}
              />
              <span className="hidden sm:inline">about me</span>
              <span className="sm:hidden">about</span>
            </span>
          </button>

          {/* Feedback & Ratings Pill */}
          <a
            href="feedback.html"
            data-testid="pixel-feedback-btn"
            title="Rate slop-deps and share feedback"
            className="group relative inline-flex items-center p-[2px] bg-[#F5F5F0]/35 hover:bg-[#F5F5F0] pixel-pill-clip pixel-btn-anim cursor-pointer whitespace-nowrap shrink-0 min-h-[36px] sm:min-h-0"
          >
            <span className="pixel-btn-sheen inline-flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-3 py-1.5 sm:py-2 font-pixel text-[10px] sm:text-xs uppercase tracking-[0.08em] pixel-pill-clip transition-colors duration-150 bg-[#080A0F] text-[#F5F5F0]">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
              <span className="hidden sm:inline">feedback</span>
              <span className="sm:hidden">rate</span>
            </span>
          </a>

          {/* GitHub Octocat Slot */}
          <a
            href={GITHUB_REPO_URL}
            target="_blank"
            rel="noreferrer"
            data-testid="top-right-image-slot"
            title="GitHub Repository"
            className="group relative p-[2px] bg-[#F5F5F0]/35 hover:bg-[#F5F5F0] pixel-pill-clip pixel-btn-anim shrink-0 cursor-pointer block min-h-[36px] min-w-[36px] sm:min-h-0 sm:min-w-0"
          >
            <div className="pixel-btn-sheen w-7 h-7 sm:w-9 sm:h-9 bg-[#080A0F] pixel-pill-clip flex items-center justify-center overflow-hidden text-[#F5F5F0]/80">
              {customImageSrc ? (
                <img
                  src={customImageSrc}
                  alt="GitHub Octocat"
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover [image-rendering:pixelated] group-hover:scale-110 transition-transform duration-150"
                />
              ) : (
                <PixelImageFrameIcon className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-[#F5F5F0]/80 group-hover:scale-110 transition-transform duration-150" />
              )}
            </div>
          </a>

          {/* Download / Install Button */}
          <a
            ref={downloadBtnRef}
            href={GITHUB_REPO_URL}
            target="_blank"
            rel="noreferrer"
            data-testid="pixel-download-btn"
            onClick={(e) => {
              if (!e.metaKey && !e.ctrlKey && !e.shiftKey) {
                e.preventDefault();
                toggleDownload();
              }
            }}
            className="group relative inline-flex items-center p-[2px] bg-[#F5F5F0] hover:bg-white pixel-pill-clip pixel-btn-anim cursor-pointer whitespace-nowrap shrink-0 min-h-[36px] sm:min-h-0"
          >
            <span className="pixel-btn-sheen-dark inline-flex items-center gap-1.5 sm:gap-2 px-2.5 py-1.5 sm:px-4 sm:py-2 bg-[#F5F5F0] group-hover:bg-white text-[#040507] font-pixel text-[10px] sm:text-xs font-bold uppercase tracking-[0.06em] pixel-pill-clip">
              <PixelDownloadIcon
                className={`w-3.5 h-3.5 sm:w-4 sm:h-4 text-[#040507] transition-transform duration-150 ${
                  isDownloadActive
                    ? 'translate-y-0.5'
                    : 'group-hover:translate-y-0.5'
                }`}
              />
              <span className="hidden sm:inline">get cli</span>
              <span className="sm:hidden">cli</span>
            </span>
          </a>
        </div>
      </header>

      {/* Popover Dim Backdrop Scrim */}
      {(aboutState !== 'closed' || downloadState !== 'closed') && (
        <div
          data-testid="popover-scrim"
          aria-hidden="true"
          onClick={() => {
            if (aboutState === 'open') closeAboutContext();
            if (downloadState === 'open') closeDownloadContext();
          }}
          className={`fixed inset-0 z-35 bg-black/65 backdrop-blur-[2px] transition-opacity duration-200 ${
            aboutState === 'closing' || downloadState === 'closing'
              ? 'opacity-0'
              : 'opacity-100'
          }`}
        />
      )}

      {/* About Me Context Popover */}
      {aboutState !== 'closed' && (
        <div
          ref={aboutPopoverRef}
          role="dialog"
          aria-modal="true"
          aria-label="About Vidit Patil"
          data-testid="about-me-popover"
          data-context-state={aboutState}
          className={`fixed top-16 sm:top-20 inset-x-3.5 sm:inset-x-auto sm:right-6 md:right-10 mx-auto sm:mx-0 z-40 w-auto max-w-[440px] sm:w-[440px] p-[2px] bg-[#F5F5F0]/55 pixel-card-clip shadow-[0_20px_50px_rgba(0,0,0,0.85)] ${
            aboutState === 'closing'
              ? 'animate-context-close-center'
              : 'animate-context-open-center'
          }`}
        >
          <div className="bg-[#080A0F] p-5 text-[#F5F5F0] pixel-card-clip">
            <div className="flex items-center justify-between pb-3 mb-3 border-b-2 border-[#F5F5F0]/15">
              <div className="flex items-center gap-2 font-pixel text-xs uppercase text-[#F5F5F0]">
                <PixelUserIcon className="w-4 h-4" />
                <span>vidit patil</span>
              </div>
              <button
                type="button"
                data-testid="close-about-btn"
                aria-label="Close about me"
                onClick={closeAboutContext}
                className="p-1 text-[#F5F5F0]/60 hover:text-[#F5F5F0] hover:rotate-90 hover:scale-110 active:scale-90 transition-all duration-150 cursor-pointer"
              >
                <PixelCloseIcon className="w-4 h-4" />
              </button>
            </div>
            <p className="font-terminal text-xs leading-relaxed text-[#F5F5F0]/80 animate-context-item-in">
              Creator of slop-deps, a zero-dependency supply-chain scanner catching AI-hallucinated and typosquatted packages across npm, PyPI, and crates.io before install.
            </p>
          </div>
        </div>
      )}

      {/* Download / GitHub Repo Popover */}
      {downloadState !== 'closed' && (
        <div
          ref={downloadPopoverRef}
          role="dialog"
          aria-modal="true"
          aria-label="Install slop-deps CLI"
          data-testid="download-popover"
          data-context-state={downloadState}
          className={`fixed top-16 sm:top-20 inset-x-3.5 sm:inset-x-auto sm:right-6 md:right-10 mx-auto sm:mx-0 z-40 w-auto max-w-[400px] sm:w-[400px] p-[2px] bg-[#F5F5F0]/55 pixel-card-clip shadow-[0_20px_50px_rgba(0,0,0,0.85)] ${
            downloadState === 'closing'
              ? 'animate-context-close-right'
              : 'animate-context-open-right'
          }`}
        >
          <div className="bg-[#080A0F] p-5 text-[#F5F5F0] pixel-card-clip">
            <div className="flex items-center justify-between pb-3 mb-3 border-b-2 border-[#F5F5F0]/15">
              <div className="flex items-center gap-2 font-pixel text-xs uppercase">
                <PixelDownloadIcon className="w-4 h-4" />
                <span>slop-deps</span>
              </div>
              <button
                type="button"
                data-testid="close-download-btn"
                aria-label="Close download menu"
                onClick={closeDownloadContext}
                className="p-1 text-[#F5F5F0]/60 hover:text-[#F5F5F0] hover:rotate-90 hover:scale-110 active:scale-90 transition-all duration-150 cursor-pointer"
              >
                <PixelCloseIcon className="w-4 h-4" />
              </button>
            </div>

            <div className="flex items-center justify-between gap-2 bg-[#040507] border-2 border-[#F5F5F0]/20 px-3.5 py-2.5 mb-3 animate-context-item-in">
              <code className="font-terminal text-xs text-[#F5F5F0]">
                $ slopdeps
              </code>
              <button
                type="button"
                onClick={handleCopyCli}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-[#F5F5F0]/15 hover:bg-[#F5F5F0]/30 font-pixel text-[10px] uppercase text-[#F5F5F0] pixel-pill-clip pixel-btn-anim cursor-pointer whitespace-nowrap shrink-0"
              >
                {copiedCmd ? (
                  <>
                    <PixelCheckIcon className="w-3.5 h-3.5" />
                    <span>copied</span>
                  </>
                ) : (
                  <span>copy</span>
                )}
              </button>
            </div>

            <a
              href="/slopdeps-installer.exe"
              download="slopdeps-installer.exe"
              data-testid="download-exe-link"
              className="group w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 mb-2.5 bg-[#F5F5F0]/15 hover:bg-[#F5F5F0]/25 text-[#F5F5F0] font-pixel text-xs uppercase pixel-pill-clip pixel-btn-anim cursor-pointer whitespace-nowrap animate-context-item-in"
            >
              <PixelDownloadIcon className="w-4 h-4 group-hover:translate-y-0.5 transition-transform duration-150" />
              <span>download windows (.exe)</span>
            </a>

            <a
              href={GITHUB_REPO_URL}
              target="_blank"
              rel="noreferrer"
              data-testid="download-github-link"
              className="group w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-[#F5F5F0] hover:bg-white text-[#040507] font-pixel text-xs font-bold uppercase pixel-pill-clip pixel-btn-anim pixel-btn-sheen-dark whitespace-nowrap animate-context-item-in"
            >
              <PixelDownloadIcon className="w-4 h-4 group-hover:translate-y-0.5 transition-transform duration-150" />
              <span>view on github</span>
            </a>
          </div>
        </div>
      )}
    </>
  );
}
