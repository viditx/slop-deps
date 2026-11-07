import React, { useEffect, useRef, useState } from 'react';
import {
  scanFile,
  type FileScanResult,
  type PackageResult,
} from '../scanner';
import { CatState, PixelSittingCat } from './PixelSittingCat';

const CAT_PURR_SESSION_KEY = 'slop_deps_cat_purring_below';
const MIN_SCRATCH_MS = 900;
const SCAN_TIMEOUT_MS = 8000;
const MAX_ANIMATED_PAPERS = 8;

interface ScannedFileItem {
  id: string;
  rawFile: File;
  status: 'scanning' | 'done';
  streamedPackages: PackageResult[];
  result?: FileScanResult;
}

function PixelUploadIcon({ className = 'w-6 h-6' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 16 16"
      shapeRendering="crispEdges"
      className={className}
      fill="currentColor"
      aria-hidden="true"
    >
      <rect x="7" y="2" width="2" height="2" />
      <rect x="5" y="4" width="6" height="2" />
      <rect x="3" y="6" width="2" height="2" />
      <rect x="11" y="6" width="2" height="2" />
      <rect x="7" y="6" width="2" height="5" />
      <rect x="2" y="11" width="2" height="3" />
      <rect x="12" y="11" width="2" height="3" />
      <rect x="2" y="13" width="12" height="2" />
    </svg>
  );
}

function ClawMarkXIcon({ className = 'w-3.5 h-3.5' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 16 16"
      shapeRendering="crispEdges"
      className={className}
      fill="currentColor"
      aria-hidden="true"
    >
      <rect x="2" y="2" width="2" height="2" />
      <rect x="4" y="4" width="2" height="2" />
      <rect x="6" y="6" width="4" height="4" />
      <rect x="10" y="10" width="2" height="2" />
      <rect x="12" y="12" width="2" height="2" />
      <rect x="12" y="2" width="2" height="2" />
      <rect x="10" y="4" width="2" height="2" />
      <rect x="4" y="10" width="2" height="2" />
      <rect x="2" y="12" width="2" height="2" />
    </svg>
  );
}

interface ChamberBit {
  x: number;
  y: number;
  baseX: number;
  baseY: number;
  bit: 0 | 1;
  phase: number;
  speed: number;
}

function createBlurredBitSprite(char: '0' | '1'): HTMLCanvasElement {
  const dim = 28;
  const c = document.createElement('canvas');
  c.width = dim;
  c.height = dim;
  const ctx = c.getContext('2d');
  if (ctx) {
    const cx = dim * 0.5;
    const cy = dim * 0.5;
    const grad = ctx.createRadialGradient(cx, cy, 1, cx, cy, 10);
    grad.addColorStop(0, '#F5F5F05C');
    grad.addColorStop(1, '#F5F5F000');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, dim, dim);

    try {
      ctx.filter = 'blur(1.5px)';
    } catch {
      // Radial halo covers fallback
    }
    ctx.font = '800 11px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#F5F5F0';
    ctx.fillText(char, cx, cy);
  }
  return c;
}

function isFlagged(pkg: PackageResult): boolean {
  return pkg.verdict === 'HALLUCINATED' || pkg.verdict === 'SUSPICIOUS';
}

function formatHeadline(result: FileScanResult): string {
  if (result.error === 'too_large') return 'FILE TOO LARGE (2 MB MAX)';
  if (result.error === 'timeout') return 'SCAN TIMEOUT';
  if (result.error === 'unsupported') return 'UNSUPPORTED FILE';
  if (result.error === 'invalid') return 'INVALID MANIFEST';
  if (result.error === 'empty') return 'EMPTY MANIFEST';

  const flagged =
    (result.counts.HALLUCINATED || 0) + (result.counts.SUSPICIOUS || 0);
  const unchecked = result.counts.UNCHECKED || 0;

  if (flagged > 0) {
    return `${flagged} FLAGGED`;
  }
  if (unchecked > 0) {
    return `NO FLAGGED · ${unchecked} UNCHECKED`;
  }
  if (!result.packages || result.packages.length === 0) {
    return 'NO EXTERNAL PACKAGES';
  }
  return 'NO FLAGGED PACKAGES';
}

function buildTextReport(items: ScannedFileItem[]): string {
  const lines: string[] = [];
  for (const item of items) {
    const r = item.result;
    if (!r) continue;
    lines.push(`${r.fileName} (${r.ecosystem}) - ${formatHeadline(r)}`);
    for (const p of r.packages) {
      if (isFlagged(p)) {
        const sug = p.suggestion ? ` (did you mean ${p.suggestion}?)` : '';
        lines.push(`  ! ${p.name}@${p.version} [${p.verdict}] - ${p.reason || 'flagged'}${sug}`);
      } else if (p.verdict === 'UNCHECKED') {
        lines.push(`  ? ${p.name}@${p.version} [UNCHECKED] - ${p.reason || 'lookup failed'}`);
      } else {
        lines.push(`  ✓ ${p.name}@${p.version} [VERIFIED]`);
      }
    }
  }
  return lines.join('\n');
}

export function SlopDropBox() {
  const sectionRef = useRef<HTMLElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const iconWrapRef = useRef<HTMLDivElement | null>(null);
  const inViewportRef = useRef<boolean>(false);
  const pointerRef = useRef<{ x: number; y: number; active: boolean }>({
    x: 0,
    y: 0,
    active: false,
  });

  const skipWaitResolverRef = useRef<(() => void) | null>(null);

  const [reducedMotion, setReducedMotion] = useState<boolean>(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return false;
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  });

  const [catBelowBox, setCatBelowBox] = useState<boolean>(() => {
    try {
      return sessionStorage.getItem(CAT_PURR_SESSION_KEY) === '1';
    } catch {
      return false;
    }
  });

  const [catState, setCatState] = useState<CatState>(() => {
    try {
      return sessionStorage.getItem(CAT_PURR_SESSION_KEY) === '1'
        ? CatState.Purring
        : CatState.Idle;
    } catch {
      return CatState.Idle;
    }
  });

  const [isVisible, setIsVisible] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [catLook, setCatLook] = useState<{ x: number; y: number }>({
    x: 0,
    y: 0,
  });
  const [items, setItems] = useState<ScannedFileItem[]>([]);
  const [poppedPapers, setPoppedPapers] = useState<PackageResult[]>([]);
  const [expandedVerifiedIds, setExpandedVerifiedIds] = useState<string[]>([]);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [dropBurstTime, setDropBurstTime] = useState(0);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mql = window.matchMedia('(prefers-reduced-motion: reduce)');
    const onChange = () => setReducedMotion(mql.matches);
    mql.addEventListener?.('change', onChange);
    return () => mql.removeEventListener?.('change', onChange);
  }, []);

  useEffect(() => {
    const el = sectionRef.current;
    if (!el) return;
    if (typeof IntersectionObserver === 'undefined') {
      inViewportRef.current = true;
      setIsVisible(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          inViewportRef.current = entry.isIntersecting;
          setIsVisible(entry.isIntersecting);
        }
      },
      { threshold: 0.08 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let rafId = 0;
    let width = 0;
    let height = 0;
    let bits: ChamberBit[] = [];

    const spriteBlur0 = createBlurredBitSprite('0');
    const spriteBlur1 = createBlurredBitSprite('1');
    const halfSprite = spriteBlur0.width * 0.5;

    const initBits = () => {
      const rect = canvas.getBoundingClientRect();
      width = Math.max(300, Math.floor(rect.width));
      height = Math.max(200, Math.floor(rect.height));
      canvas.width = width;
      canvas.height = height;

      bits = [];
      const stepX = 30;
      const stepY = 28;
      let idx = 0;
      for (let y = 18; y < height - 12; y += stepY) {
        for (let x = 20; x < width - 16; x += stepX) {
          bits.push({
            x,
            y,
            baseX: x,
            baseY: y,
            bit: (idx * 5 + 1) % 3 === 0 ? 1 : idx % 2 === 0 ? 0 : 1,
            phase: ((x * 13 + y * 7) % 100) * 0.0628,
            speed: 0.9 + ((x * 3 + y) % 5) * 0.18,
          });
          idx++;
        }
      }
    };

    initBits();
    const start = performance.now();

    const render = (now: number) => {
      if (!inViewportRef.current || document.hidden) {
        rafId = window.requestAnimationFrame(render);
        return;
      }

      const elapsed = (now - start) * 0.001;
      ctx.clearRect(0, 0, width, height);

      const cx = width * 0.5;
      const cy = height * 0.42;
      const burstElapsed =
        dropBurstTime > 0 ? (now - dropBurstTime) * 0.001 : 99;
      const burstWave =
        burstElapsed < 0.75 ? Math.sin((burstElapsed / 0.75) * Math.PI) : 0;

      if (iconWrapRef.current && !reducedMotion) {
        const bobY =
          Math.sin(elapsed * (isDragging ? 5.2 : isHovered ? 3.2 : 2.1)) *
          (isDragging ? 5 : 3);
        const scale = isDragging ? 1.12 : isHovered ? 1.05 : 1;
        iconWrapRef.current.style.transform = `translate3d(0, ${bobY.toFixed(2)}px, 0) scale(${scale})`;
      }

      const ptrActive = pointerRef.current.active;
      const ptrX = pointerRef.current.x;
      const ptrY = pointerRef.current.y;

      for (let i = 0; i < bits.length; i++) {
        const b = bits[i];
        const dxCenter = cx - b.baseX;
        const dyCenter = cy - b.baseY;
        const distCenterSq = dxCenter * dxCenter + dyCenter * dyCenter;

        if (distCenterSq < 9025 && !isDragging) continue;

        const distCenter = Math.sqrt(distCenterSq) || 1;
        let targetX = reducedMotion
          ? b.baseX
          : b.baseX + Math.sin(elapsed * b.speed + b.phase) * 2.5;
        let targetY = reducedMotion
          ? b.baseY
          : b.baseY - ((elapsed * 12 * b.speed + b.phase * 10) % 18);

        if (isDragging && !reducedMotion) {
          const pull = Math.min(0.42, 48 / distCenter);
          targetX = b.baseX + dxCenter * pull;
          targetY = b.baseY + dyCenter * pull;
        } else if (ptrActive && !reducedMotion) {
          const pdx = b.baseX - ptrX;
          if (pdx < 90 && pdx > -90) {
            const pdy = b.baseY - ptrY;
            if (pdy < 90 && pdy > -90) {
              const pDistSq = pdx * pdx + pdy * pdy;
              if (pDistSq < 8100 && pDistSq > 1) {
                const pDist = Math.sqrt(pDistSq);
                const push = ((90 - pDist) / 90) * 14;
                targetX += (pdx / pDist) * push;
                targetY += (pdy / pDist) * push;
              }
            }
          }
        }

        if (burstWave > 0.01 && !reducedMotion) {
          targetX -= (dxCenter / distCenter) * burstWave * 18;
          targetY -= (dyCenter / distCenter) * burstWave * 18;
        }

        b.x += (targetX - b.x) * 0.18;
        b.y += (targetY - b.y) * 0.18;

        const edgeFade = Math.min(1, Math.max(0.12, (distCenter - 85) / 95));
        const baseAlpha = isDragging ? 0.42 : isHovered ? 0.24 : 0.15;
        const pulse = reducedMotion
          ? 0.85
          : 0.72 + 0.28 * Math.sin(elapsed * 2.2 + b.phase);
        ctx.globalAlpha = Math.min(
          0.75,
          baseAlpha * edgeFade * pulse + burstWave * 0.25
        );

        const sprite = b.bit === 0 ? spriteBlur0 : spriteBlur1;
        ctx.drawImage(
          sprite,
          (b.x - halfSprite) | 0,
          (b.y - halfSprite) | 0
        );
      }

      ctx.globalAlpha = 1;
      rafId = window.requestAnimationFrame(render);
    };

    rafId = window.requestAnimationFrame(render);
    window.addEventListener('resize', initBits);
    return () => {
      window.cancelAnimationFrame(rafId);
      window.removeEventListener('resize', initBits);
    };
  }, [isDragging, isHovered, dropBurstTime, reducedMotion]);

  const copyWithFeedback = async (text: string, key: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // Fallback ignored if clipboard blocked
    }
    setCopiedKey(key);
    window.setTimeout(() => {
      setCopiedKey((prev) => (prev === key ? null : prev));
    }, 1600);
  };

  const runScanWithTimeout = (
    file: File,
    onPkg: (p: PackageResult) => void
  ): Promise<FileScanResult> => {
    const start = performance.now();
    return new Promise<FileScanResult>((resolve) => {
      let settled = false;
      const timer = window.setTimeout(() => {
        if (settled) return;
        settled = true;
        resolve({
          fileName: file.name,
          ecosystem: 'unknown',
          packages: [],
          counts: {
            HALLUCINATED: 0,
            SUSPICIOUS: 0,
            VERIFIED: 0,
            UNCHECKED: 0,
          },
          durationMs: Math.round(performance.now() - start),
          error: 'timeout',
        });
      }, SCAN_TIMEOUT_MS);

      scanFile(file, (pkg) => {
        if (!settled) onPkg(pkg);
      }).then((res) => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timer);
        resolve(res);
      });
    });
  };

  const processNativeFiles = async (fileList: FileList | File[]) => {
    const arr = Array.from(fileList);
    if (arr.length === 0) return;

    setDropBurstTime(performance.now());
    const nowStamp = Date.now();

    const newEntries: ScannedFileItem[] = arr.map((file, idx) => ({
      id: `${file.name}-${file.size}-${nowStamp}-${idx}`,
      rawFile: file,
      status: 'scanning',
      streamedPackages: [],
    }));

    setItems(newEntries);
    setPoppedPapers([]);
    setExpandedVerifiedIds([]);

    // State machine: idle -> scratching
    setCatState(
      reducedMotion ? CatState.Reporting : CatState.Scratching
    );

    const minWaitPromise = reducedMotion
      ? Promise.resolve()
      : new Promise<void>((resolve) => {
          skipWaitResolverRef.current = resolve;
          window.setTimeout(() => {
            if (skipWaitResolverRef.current === resolve) {
              skipWaitResolverRef.current = null;
            }
            resolve();
          }, MIN_SCRATCH_MS);
        });

    let sawFlaggedLive = false;

    const scanPromises = newEntries.map(async (entry) => {
      const result = await runScanWithTimeout(entry.rawFile, (pkg) => {
        if (isFlagged(pkg)) {
          sawFlaggedLive = true;
          setCatState(CatState.Alert);
        }
        setPoppedPapers((prev) => [...prev, pkg]);
        setItems((prev) =>
          prev.map((it) =>
            it.id === entry.id
              ? { ...it, streamedPackages: [...it.streamedPackages, pkg] }
              : it
          )
        );
      });

      return { id: entry.id, result };
    });

    const [resolvedScans] = await Promise.all([
      Promise.all(scanPromises),
      minWaitPromise,
    ]);

    // State machine: scratching -> reporting -> (alert | happy) -> purring
    if (!reducedMotion && !sawFlaggedLive) {
      setCatState(CatState.Reporting);
    }

    setItems((prev) =>
      prev.map((it) => {
        const found = resolvedScans.find((r) => r.id === it.id);
        return found
          ? { ...it, status: 'done', result: found.result }
          : { ...it, status: 'done' };
      })
    );

    const totalFlagged = resolvedScans.reduce((acc, { result }) => {
      return (
        acc +
        (result.counts.HALLUCINATED || 0) +
        (result.counts.SUSPICIOUS || 0)
      );
    }, 0);

    const hasAnyError = resolvedScans.some((r) => Boolean(r.result.error));

    if (totalFlagged > 0) {
      // Flagged result: cat goes alert and stays on top, NEVER purrs
      setCatState(CatState.Alert);
      setCatBelowBox(false);
    } else if (hasAnyError) {
      setCatState(CatState.Idle);
    } else {
      // Clean / Unchecked with 0 flagged: happy -> purring below drop box, persisted in sessionStorage
      setCatState(CatState.Happy);
      const finalizePurr = () => {
        setCatState(CatState.Purring);
        setCatBelowBox(true);
        try {
          sessionStorage.setItem(CAT_PURR_SESSION_KEY, '1');
        } catch {
          // Ignore storage quota errors
        }
      };
      if (reducedMotion) {
        finalizePurr();
      } else {
        window.setTimeout(finalizePurr, 260);
      }
    }
  };

  const handleSkipAnimation = () => {
    if (skipWaitResolverRef.current) {
      const fn = skipWaitResolverRef.current;
      skipWaitResolverRef.current = null;
      fn();
    }
  };

  const handleRetryFile = async (itemId: string) => {
    const target = items.find((it) => it.id === itemId);
    if (!target) return;

    setItems((prev) =>
      prev.map((it) =>
        it.id === itemId ? { ...it, status: 'scanning', streamedPackages: [] } : it
      )
    );
    setCatState(reducedMotion ? CatState.Reporting : CatState.Scratching);

    const result = await runScanWithTimeout(target.rawFile, (pkg) => {
      if (isFlagged(pkg)) {
        setCatState(CatState.Alert);
      }
      setItems((prev) =>
        prev.map((it) =>
          it.id === itemId
            ? { ...it, streamedPackages: [...it.streamedPackages, pkg] }
            : it
        )
      );
    });

    setItems((prev) =>
      prev.map((it) =>
        it.id === itemId ? { ...it, status: 'done', result } : it
      )
    );

    const flagged =
      (result.counts.HALLUCINATED || 0) + (result.counts.SUSPICIOUS || 0);
    if (flagged > 0) {
      setCatState(CatState.Alert);
      setCatBelowBox(false);
    } else if (!result.error) {
      setCatState(CatState.Purring);
      setCatBelowBox(true);
      try {
        sessionStorage.setItem(CAT_PURR_SESSION_KEY, '1');
      } catch {
        // Ignore
      }
    } else {
      setCatState(CatState.Idle);
    }
  };

  const handleScanAnother = () => {
    setItems([]);
    setPoppedPapers([]);
    setExpandedVerifiedIds([]);
    if (catState === CatState.Alert) {
      setCatState(catBelowBox ? CatState.Purring : CatState.Idle);
    }
    fileInputRef.current?.click();
  };

  const toggleVerifiedExpand = (id: string) => {
    setExpandedVerifiedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  // Sort popped papers so flagged always appear first among the max 8 animated papers
  const sortedPapers = [...poppedPapers].sort((a, b) => {
    const aFlag = isFlagged(a) ? 0 : a.verdict === 'UNCHECKED' ? 1 : 2;
    const bFlag = isFlagged(b) ? 0 : b.verdict === 'UNCHECKED' ? 1 : 2;
    return aFlag - bFlag;
  });
  const visiblePapers = sortedPapers.slice(0, MAX_ANIMATED_PAPERS);
  const extraCheckedCount = Math.max(
    0,
    poppedPapers.length - MAX_ANIMATED_PAPERS
  );

  const isScanningAny = items.some((it) => it.status === 'scanning');
  const completedItems = items.filter((it) => it.status === 'done' && it.result);

  const batchTotals = completedItems.reduce(
    (acc, it) => {
      const c = it.result!.counts;
      acc.flagged += (c.HALLUCINATED || 0) + (c.SUSPICIOUS || 0);
      acc.unchecked += c.UNCHECKED || 0;
      acc.verified += c.VERIFIED || 0;
      return acc;
    },
    { flagged: 0, unchecked: 0, verified: 0 }
  );

  return (
    <section
      ref={sectionRef}
      id="slop-drop-section"
      data-testid="slop-drop-section"
      aria-label="File drop zone"
      className="relative z-20 w-full max-w-[640px] mx-auto px-3.5 sm:px-6 pt-6 pb-28 sm:pb-32 pointer-events-auto scroll-mt-24 sm:scroll-mt-28"
    >
      <div
        className={`relative transition-all duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] ${
          isVisible
            ? 'opacity-100 translate-y-0 scale-100'
            : 'opacity-0 translate-y-6 scale-[0.97]'
        }`}
      >
        {/* Cat perched ON TOP of the drop box (until first clean result transitions it to purring below) */}
        {!catBelowBox && (
          <div
            data-testid="cat-top-perch"
            title="Resident Sentinel Cat"
            className="relative z-30 flex flex-col items-center -mb-[11px] cursor-pointer"
          >
            <PixelSittingCat
              state={catState}
              isDragging={isDragging}
              isHovered={isHovered}
              lookX={catLook.x}
              lookY={catLook.y}
              reducedMotion={reducedMotion}
            />
          </div>
        )}

        {/* Hidden Native File Input */}
        <input
          ref={fileInputRef}
          type="file"
          multiple
          data-testid="slop-file-input"
          aria-label="Upload files"
          onChange={(e) => {
            if (e.target.files && e.target.files.length > 0) {
              void processNativeFiles(e.target.files);
              e.target.value = '';
            }
          }}
          className="sr-only"
        />

        {/* Single Clean 16-Bit Stepped Pixel Drop Box */}
        <div
          className={`relative p-[2px] transition-all duration-200 pixel-card-clip shadow-[0_24px_64px_rgba(0,0,0,0.88)] ${
            isDragging
              ? 'bg-[#F5F5F0] scale-[1.015]'
              : isHovered
                ? 'bg-[#F5F5F0]/75'
                : 'bg-[#F5F5F0]/38'
          }`}
        >
          <div className="relative bg-[#080A0F]/95 pixel-card-clip overflow-hidden">
            {/* Interactive Drop Area */}
            <div
              data-testid="slop-drop-zone"
              onDragOver={(e) => {
                e.preventDefault();
                e.stopPropagation();
                if (!isDragging) setIsDragging(true);
              }}
              onDragLeave={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setIsDragging(false);
              }}
              onDrop={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setIsDragging(false);
                if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                  void processNativeFiles(e.dataTransfer.files);
                }
              }}
              onMouseEnter={() => setIsHovered(true)}
              onMouseLeave={() => {
                setIsHovered(false);
                pointerRef.current.active = false;
                setCatLook({ x: 0, y: 0 });
              }}
              onMouseMove={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                const localX = e.clientX - rect.left;
                const localY = e.clientY - rect.top;
                pointerRef.current.x = localX;
                pointerRef.current.y = localY;
                pointerRef.current.active = true;

                const nx = (localX / Math.max(1, rect.width) - 0.5) * 2.4;
                const ny = localY > rect.height * 0.3 ? 1 : 0;
                if (Math.round(nx) !== catLook.x || ny !== catLook.y) {
                  setCatLook({ x: Math.round(nx), y: ny });
                }
              }}
              onClick={() => fileInputRef.current?.click()}
              role="button"
              tabIndex={0}
              aria-label="Drag files here or click to browse"
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  fileInputRef.current?.click();
                }
              }}
              className="group relative cursor-pointer px-4 py-9 sm:px-8 sm:py-12 md:py-14 flex flex-col items-center justify-center text-center overflow-hidden"
            >
              <canvas
                ref={canvasRef}
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 w-full h-full opacity-95"
              />

              <div
                ref={iconWrapRef}
                className="relative z-10 mb-5 p-[2px] bg-[#F5F5F0]/40 group-hover:bg-[#F5F5F0] transition-colors duration-150 pixel-pill-clip"
              >
                <div className="w-12 h-12 bg-[#040507] flex items-center justify-center text-[#F5F5F0] pixel-pill-clip">
                  <PixelUploadIcon className="w-5 h-5 group-hover:-translate-y-0.5 transition-transform duration-150" />
                </div>
              </div>

              <h2 className="relative z-10 font-pixel text-xs md:text-sm uppercase tracking-[0.08em] text-[#F5F5F0] mb-6 transition-transform duration-200">
                {isDragging ? 'release to drop files' : 'drag files here'}
              </h2>

              <div
                className="relative z-10 flex items-center gap-3"
                onClick={(e) => e.stopPropagation()}
              >
                <button
                  type="button"
                  data-testid="browse-files-btn"
                  onClick={() => fileInputRef.current?.click()}
                  className="group/btn inline-flex items-center p-[2px] bg-[#F5F5F0] hover:bg-white pixel-pill-clip pixel-btn-anim cursor-pointer whitespace-nowrap shrink-0"
                >
                  <span className="pixel-btn-sheen-dark inline-flex items-center gap-2 px-5 py-2 bg-[#F5F5F0] group-hover/btn:bg-white text-[#040507] font-pixel text-xs font-bold uppercase tracking-[0.06em] pixel-pill-clip">
                    <span>browse files</span>
                  </span>
                </button>

                {isScanningAny && !reducedMotion && (
                  <button
                    type="button"
                    data-testid="skip-scan-anim-btn"
                    onClick={handleSkipAnimation}
                    className="px-3 py-2 border border-[#F5F5F0]/35 bg-[#040507] text-[#F5F5F0]/75 hover:text-[#F5F5F0] hover:border-[#F5F5F0] font-pixel text-[10px] uppercase tracking-[0.06em] cursor-pointer"
                  >
                    skip
                  </button>
                )}
              </div>

              {/* Popping Package Papers Tray (fires as onPackage resolves, max 8 papers, flagged first) */}
              {visiblePapers.length > 0 && (
                <div
                  data-testid="popped-papers-tray"
                  onClick={(e) => e.stopPropagation()}
                  className="relative z-10 mt-6 flex flex-wrap items-center justify-center gap-2 max-w-[540px]"
                >
                  {visiblePapers.map((paper, idx) => {
                    const flagged = isFlagged(paper);
                    const unchecked = paper.verdict === 'UNCHECKED';
                    return (
                      <div
                        key={`${paper.name}-${idx}`}
                        data-testid="popped-package-paper"
                        data-paper-verdict={paper.verdict}
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1 font-terminal text-[11px] border transition-all ${
                          reducedMotion ? '' : 'animate-context-item-in'
                        } ${
                          flagged
                            ? 'bg-[#080A0F] border-[#FB7185] text-[#FB7185] -rotate-1'
                            : unchecked
                              ? 'bg-[#080A0F]/60 border-[#F5F5F0]/20 text-[#F5F5F0]/45'
                              : 'bg-[#080A0F] border-[#F5F5F0]/45 text-[#F5F5F0]'
                        }`}
                      >
                        {flagged ? (
                          <span
                            data-testid="paper-claw-mark"
                            className="inline-flex items-center text-[#FB7185] font-bold"
                            title="Flagged"
                          >
                            <ClawMarkXIcon className="w-3 h-3" />
                          </span>
                        ) : unchecked ? (
                          <span className="font-bold text-[#F5F5F0]/50">?</span>
                        ) : (
                          <span className="font-bold text-[#F5F5F0]">✓</span>
                        )}
                        <span className="truncate max-w-[130px]">
                          {paper.name}
                        </span>
                      </div>
                    );
                  })}

                  {extraCheckedCount > 0 && (
                    <span
                      data-testid="extra-papers-counter"
                      className="px-2 py-1 font-terminal text-[11px] border border-[#F5F5F0]/25 bg-[#040507] text-[#F5F5F0]/65 tabular-nums"
                    >
                      +{extraCheckedCount} checked
                    </span>
                  )}
                </div>
              )}
            </div>

            {/* Minimal Monochrome Result Panel (ONE accent color #FB7185 for flagged only) */}
            <div
              data-testid="scan-results-region"
              aria-live="polite"
              className="border-t border-[#F5F5F0]/15 bg-[#040507]/95"
            >
              {isScanningAny && completedItems.length === 0 && (
                <div
                  data-testid="scanning-live-banner"
                  className="px-6 py-4 flex items-center justify-between font-terminal text-xs text-[#F5F5F0]/75"
                >
                  <span>
                    Scratching manifest ({poppedPapers.length} packages checked)...
                  </span>
                  {!reducedMotion && (
                    <button
                      type="button"
                      onClick={handleSkipAnimation}
                      className="font-pixel text-[10px] uppercase tracking-[0.06em] text-[#F5F5F0]/65 hover:text-[#F5F5F0] underline cursor-pointer"
                    >
                      skip
                    </button>
                  )}
                </div>
              )}

              {completedItems.length > 0 && (
                <div
                  data-testid="dropped-files-drawer"
                  className="px-4 py-4 sm:px-6 sm:py-5 space-y-4 sm:space-y-5"
                >
                  {/* Multi-file summary header when > 1 files are dropped */}
                  {completedItems.length > 1 && (
                    <div
                      data-testid="multi-file-summary"
                      className="pb-3 border-b border-[#F5F5F0]/15 flex flex-wrap items-center justify-between gap-2 font-terminal text-xs text-[#F5F5F0]/75"
                    >
                      <span className="font-pixel text-[10px] uppercase tracking-[0.08em] text-[#F5F5F0]">
                        {completedItems.length} files scanned
                      </span>
                      <span className="tabular-nums">
                        ! {batchTotals.flagged} flagged · ? {batchTotals.unchecked} unchecked · ✓ {batchTotals.verified} verified
                      </span>
                    </div>
                  )}

                  {/* One Result Card per File */}
                  <div className="space-y-5 divide-y divide-[#F5F5F0]/15">
                    {completedItems.map((item) => {
                      const res = item.result!;
                      const headline = formatHeadline(res);
                      const flaggedPackages = res.packages.filter(isFlagged);
                      const uncheckedPackages = res.packages.filter(
                        (p) => p.verdict === 'UNCHECKED'
                      );
                      const verifiedPackages = res.packages.filter(
                        (p) => p.verdict === 'VERIFIED'
                      );
                      const hasFlagged = flaggedPackages.length > 0;
                      const isVerifiedExpanded = expandedVerifiedIds.includes(
                        item.id
                      );

                      return (
                        <div
                          key={item.id}
                          data-testid="dropped-file-card"
                          className="pt-4 first:pt-0 space-y-3"
                        >
                          {/* Dim meta line: file · ecosystem · count */}
                          <div
                            data-testid="result-meta-line"
                            className="font-terminal text-xs text-[#F5F5F0]/50 flex flex-wrap items-center gap-1.5"
                          >
                            <span className="text-[#F5F5F0]/75">
                              {res.fileName}
                            </span>
                            <span aria-hidden="true">·</span>
                            <span>{res.ecosystem}</span>
                            <span aria-hidden="true">·</span>
                            <span className="tabular-nums">
                              {res.packages.length}{' '}
                              {res.packages.length === 1
                                ? 'package'
                                : 'packages'}
                            </span>
                          </div>

                          {/* Big Headline */}
                          <div className="flex items-baseline gap-2.5">
                            {hasFlagged && (
                              <span
                                aria-hidden="true"
                                className="font-pixel text-base md:text-lg font-bold text-[#FB7185]"
                              >
                                !
                              </span>
                            )}
                            <h3
                              data-testid="result-headline"
                              className={`font-pixel text-base md:text-lg uppercase tracking-[0.06em] ${
                                hasFlagged
                                  ? 'text-[#FB7185]'
                                  : 'text-[#F5F5F0]'
                              }`}
                            >
                              {headline}
                            </h3>
                          </div>

                          {/* Edge State Messages or Counts Line */}
                          {res.error ? (
                            <p
                              data-testid="result-error-message"
                              className="font-terminal text-xs text-[#F5F5F0]/70"
                            >
                              {res.error === 'too_large'
                                ? 'File exceeds 2MB browser scan limit. Use the slopdeps CLI for larger files or monorepos.'
                                : res.error === 'timeout'
                                  ? 'Network request timed out checking remote registries. Try again or run offline via CLI.'
                                  : res.error === 'unsupported'
                                    ? 'Unsupported file type. Drop manifests (package.json, requirements.txt, Cargo.toml) or code (.html, .js, .ts, .py, .rs).'
                                    : res.error === 'invalid'
                                      ? 'Could not parse file syntax or dependencies.'
                                      : 'No package dependencies or imports found in this file.'}
                            </p>
                          ) : (
                            <>
                              {/* Counts Line */}
                              <div
                                data-testid="result-counts-line"
                                className="font-terminal text-xs text-[#F5F5F0]/70 tabular-nums"
                              >
                                <span
                                  className={
                                    hasFlagged
                                      ? 'text-[#FB7185] font-bold'
                                      : ''
                                  }
                                >
                                  ! {flaggedPackages.length} flagged
                                </span>
                                <span className="mx-2 text-[#F5F5F0]/60">·</span>
                                <span>
                                  ? {uncheckedPackages.length} unchecked
                                </span>
                                <span className="mx-2 text-[#F5F5F0]/60">·</span>
                                <span>
                                  ✓ {verifiedPackages.length} verified
                                </span>
                              </div>

                              {/* Flagged Rows (! name · reason · "did you mean X?" with copy) */}
                              {flaggedPackages.length > 0 && (
                                <div
                                  data-testid="flagged-packages-list"
                                  className="space-y-2 pt-1"
                                >
                                  {flaggedPackages.map((pkg) => {
                                    const copySugKey = `sug-${item.id}-${pkg.name}`;
                                    return (
                                      <div
                                        key={pkg.name}
                                        data-testid="inspected-package-row"
                                        data-package-name={pkg.name}
                                        data-package-verdict={pkg.verdict}
                                        className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 border border-[#FB7185]/45 bg-[#FB7185]/10 font-terminal text-xs"
                                      >
                                        <div className="flex flex-wrap items-center gap-2 min-w-0">
                                          <span
                                            aria-label="Flagged"
                                            className="font-bold text-[#FB7185]"
                                          >
                                            !
                                          </span>
                                          <span className="font-bold text-[#FB7185]">
                                            {pkg.name}
                                          </span>
                                          <span className="text-[#F5F5F0]/65">
                                            ·
                                          </span>
                                          <span className="text-[#F5F5F0]/85">
                                            {pkg.reason ||
                                              (pkg.verdict === 'HALLUCINATED'
                                                ? 'registry 404 (not found)'
                                                : 'typosquat match')}
                                          </span>
                                          {pkg.suggestion && (
                                            <>
                                              <span className="text-[#F5F5F0]/65">
                                                ·
                                              </span>
                                              <span
                                                data-testid="typosquat-resembles"
                                                className="text-[#F5F5F0]"
                                              >
                                                did you mean{' '}
                                                <strong className="underline">
                                                  {pkg.suggestion}
                                                </strong>
                                                ?
                                              </span>
                                              <button
                                                type="button"
                                                data-testid="copy-suggestion-btn"
                                                onClick={() =>
                                                  void copyWithFeedback(
                                                    pkg.suggestion!,
                                                    copySugKey
                                                  )
                                                }
                                                className="px-1.5 py-0.5 border border-[#F5F5F0]/35 bg-[#040507] text-[#F5F5F0] font-pixel text-[9px] uppercase hover:bg-[#F5F5F0] hover:text-[#040507] transition-colors cursor-pointer"
                                              >
                                                {copiedKey === copySugKey
                                                  ? 'copied'
                                                  : 'copy'}
                                              </button>
                                            </>
                                          )}
                                        </div>

                                        <span
                                          data-testid="package-verdict-badge"
                                          className="px-1.5 py-0.5 text-[10px] font-bold uppercase border border-[#FB7185]/50 text-[#FB7185] shrink-0"
                                        >
                                          {pkg.verdict}
                                        </span>
                                      </div>
                                    );
                                  })}
                                </div>
                              )}

                              {/* Unchecked Rows (? + retry) */}
                              {uncheckedPackages.length > 0 && (
                                <div
                                  data-testid="unchecked-packages-list"
                                  className="space-y-1.5 pt-1"
                                >
                                  {uncheckedPackages.map((pkg) => (
                                    <div
                                      key={pkg.name}
                                      data-testid="inspected-package-row"
                                      data-package-name={pkg.name}
                                      data-package-verdict={pkg.verdict}
                                      className="flex flex-wrap items-center justify-between gap-2 px-3 py-1.5 border border-[#F5F5F0]/20 bg-[#080A0F] font-terminal text-xs text-[#F5F5F0]/70"
                                    >
                                      <div className="flex flex-wrap items-center gap-2 min-w-0">
                                        <span className="font-bold text-[#F5F5F0]/60">
                                          ?
                                        </span>
                                        <span className="text-[#F5F5F0]">
                                          {pkg.name}
                                        </span>
                                        <span className="text-[#F5F5F0]/65">
                                          ·
                                        </span>
                                        <span className="text-[#F5F5F0]/65">
                                          {pkg.reason || 'lookup failed'}
                                        </span>
                                      </div>

                                      {pkg.ecosystem !== 'crates' && (
                                        <div className="flex items-center gap-2 shrink-0">
                                          <button
                                            type="button"
                                            data-testid="retry-unchecked-btn"
                                            onClick={() =>
                                              void handleRetryFile(item.id)
                                            }
                                            className="px-2 py-0.5 border border-[#F5F5F0]/30 bg-[#040507] text-[#F5F5F0]/80 hover:text-[#F5F5F0] hover:border-[#F5F5F0] font-pixel text-[9px] uppercase cursor-pointer"
                                          >
                                            retry
                                          </button>
                                        </div>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              )}

                              {/* Collapsed "N verified" line */}
                              {verifiedPackages.length > 0 && (
                                <div className="pt-1">
                                  <button
                                    type="button"
                                    data-testid="toggle-verified-btn"
                                    aria-expanded={isVerifiedExpanded}
                                    onClick={() =>
                                      toggleVerifiedExpand(item.id)
                                    }
                                    className="inline-flex items-center gap-2 font-terminal text-xs text-[#F5F5F0]/55 hover:text-[#F5F5F0] cursor-pointer"
                                  >
                                    <span>✓ {verifiedPackages.length} verified</span>
                                    <span className="text-[10px]">
                                      {isVerifiedExpanded ? '▲' : '▼'}
                                    </span>
                                  </button>

                                  {isVerifiedExpanded && (
                                    <div
                                      data-testid="verified-packages-list"
                                      className="mt-2 pl-3 border-l border-[#F5F5F0]/15 space-y-1 font-terminal text-xs text-[#F5F5F0]/60"
                                    >
                                      {verifiedPackages.map((pkg) => (
                                        <div
                                          key={pkg.name}
                                          data-testid="inspected-package-row"
                                          data-package-name={pkg.name}
                                          data-package-verdict={pkg.verdict}
                                          className="flex items-center justify-between py-0.5"
                                        >
                                          <span>
                                            ✓ {pkg.name}{' '}
                                            <span className="text-[#F5F5F0]/65">
                                              {pkg.version}
                                            </span>
                                          </span>
                                          <span
                                            data-testid="package-verdict-badge"
                                            className="text-[10px] uppercase text-[#F5F5F0]/50"
                                          >
                                            VERIFIED
                                          </span>
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              )}
                            </>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {/* Actions Bar: copy report / scan another / $ slopdeps copy chip */}
                  <div
                    data-testid="result-actions-bar"
                    className="pt-4 border-t border-[#F5F5F0]/15 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5"
                  >
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        data-testid="copy-report-btn"
                        onClick={() =>
                          void copyWithFeedback(
                            buildTextReport(completedItems),
                            'copy-report'
                          )
                        }
                        className="flex-1 sm:flex-initial px-3 py-2 border border-[#F5F5F0]/35 bg-[#080A0F] hover:border-[#F5F5F0] text-[#F5F5F0] font-pixel text-[10px] uppercase tracking-[0.06em] cursor-pointer text-center"
                      >
                        {copiedKey === 'copy-report'
                          ? 'copied report'
                          : 'copy report'}
                      </button>

                      <button
                        type="button"
                        data-testid="scan-another-btn"
                        onClick={handleScanAnother}
                        className="flex-1 sm:flex-initial px-3 py-2 border border-[#F5F5F0]/35 bg-[#080A0F] hover:border-[#F5F5F0] text-[#F5F5F0] font-pixel text-[10px] uppercase tracking-[0.06em] cursor-pointer text-center"
                      >
                        scan another
                      </button>
                    </div>

                    <button
                      type="button"
                      data-testid="panel-npx-chip"
                      onClick={() =>
                        void copyWithFeedback('slopdeps', 'panel-npx')
                      }
                      className="inline-flex items-center justify-center gap-2 px-3.5 py-2 border border-[#F5F5F0]/35 bg-[#080A0F] hover:border-[#F5F5F0] font-terminal text-xs text-[#F5F5F0] cursor-pointer"
                    >
                      <span>$ slopdeps</span>
                      <span className="font-pixel text-[9px] uppercase text-[#F5F5F0]/65">
                        {copiedKey === 'panel-npx' ? 'copied' : 'copy'}
                      </span>
                    </button>
                  </div>

                  {/* Footer: files never leave your browser */}
                  <div className="pt-1 flex flex-col sm:flex-row items-center justify-between gap-1 font-terminal text-[11px] text-[#F5F5F0]/65 text-center sm:text-left">
                    <span data-testid="local-privacy-notice">
                      files never leave your browser
                    </span>
                    <span>only package names are queried</span>
                  </div>
                </div>
              )}

              {completedItems.length === 0 && !isScanningAny && (
                <div className="px-4 py-2.5 flex items-center justify-center font-terminal text-[11px] text-[#F5F5F0]/65 text-center">
                  <span data-testid="local-privacy-notice">
                    files never leave your browser
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* After the FIRST clean result is shown, the cat sits below the drop box and purrs (persisted in sessionStorage, with skip/reset control) */}
        {catBelowBox && (
          <div
            data-testid="cat-bottom-perch"
            className="mt-4 flex flex-col items-center"
          >
            <PixelSittingCat
              state={catState}
              isDragging={isDragging}
              isHovered={isHovered}
              lookX={catLook.x}
              lookY={catLook.y}
              reducedMotion={reducedMotion}
            />
            <button
              type="button"
              data-testid="reset-cat-perch-btn"
              onClick={() => {
                setCatBelowBox(false);
                setCatState(CatState.Idle);
                try {
                  sessionStorage.removeItem(CAT_PURR_SESSION_KEY);
                } catch {
                  // Ignore
                }
              }}
              className="mt-1 font-pixel text-[9px] uppercase tracking-[0.08em] text-[#F5F5F0]/45 hover:text-[#F5F5F0] cursor-pointer"
            >
              skip / move cat up
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
