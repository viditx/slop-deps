import { useEffect, useRef, useState } from 'react';
import { Github } from 'lucide-react';
import { TopPixelBar } from './TopPixelBar';
import { SlopDropBox } from './SlopDropBox';
import { ReadmeSection } from './ReadmeSection';
import {
  applyScrollTargets,
  assignGlyphTargets,
  assignWordPairTargets,
  computeScrollDockState,
  createInitialSwarm,
  EnginePhase,
  Point2D,
  Pointer3D,
  stepBinarySwarm,
  triggerExpandBurst,
} from '../utils/binarySwarm';

const CORE_PARTICLE_COUNT = 2400;
const BOUNCER_PARTICLE_COUNT = 902;
const INTRO_SEEN_SESSION_KEY = 'slop_deps_intro_seen';

const MONO_CORE_COLOR = '#F5F5F0';
const MONO_DOT_SMALL = '#6E7485';
const MONO_DOT_MID = '#8C93A4';
const MONO_DOT_LARGE = '#BEC4D2';

function shouldSkipIntroOnInit(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    if (new URLSearchParams(window.location.search).get('autostart') === '1') {
      return true;
    }
    if (
      window.matchMedia &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ) {
      return true;
    }
    if (sessionStorage.getItem(INTRO_SEEN_SESSION_KEY) === '1') {
      return true;
    }
  } catch {
    // Ignore storage access errors
  }
  return false;
}

function markIntroSeenInSession(): void {
  try {
    sessionStorage.setItem(INTRO_SEEN_SESSION_KEY, '1');
  } catch {
    // Ignore storage access errors
  }
}

function sampleOrganizedMatrixPoints(
  lines: string[],
  width: number,
  height: number,
  fontSize: number,
  cellStepX: number,
  cellStepY: number,
  scaleX = 1,
  centerYRatio = 0.5
): Point2D[] {
  const off = document.createElement('canvas');
  off.width = Math.max(1, Math.floor(width));
  off.height = Math.max(1, Math.floor(height));
  const ctx = off.getContext('2d');
  if (!ctx) return [];

  ctx.clearRect(0, 0, off.width, off.height);
  ctx.fillStyle = '#FFFFFF';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `800 ${fontSize}px "JetBrains Mono", monospace`;

  ctx.save();
  ctx.translate(off.width * 0.5, off.height * centerYRatio);
  ctx.scale(scaleX, 1);

  if (lines.length === 1) {
    ctx.fillText(lines[0], 0, 0);
  } else {
    const lineGap = fontSize * 0.96;
    const totalH = (lines.length - 1) * lineGap;
    for (let i = 0; i < lines.length; i++) {
      const yOffset = -totalH * 0.5 + i * lineGap;
      ctx.fillText(lines[i], 0, yOffset);
    }
  }
  ctx.restore();

  const img = ctx.getImageData(0, 0, off.width, off.height).data;
  const pts: Point2D[] = [];
  const sx = Math.max(1, Math.round(cellStepX));
  const sy = Math.max(1, Math.round(cellStepY));

  let rowIdx = 0;
  for (let y = Math.floor(sy * 0.5); y < off.height; y += sy) {
    let colIdx = 0;
    for (let x = Math.floor(sx * 0.5); x < off.width; x += sx) {
      const idx = (y * off.width + x) * 4 + 3;
      if (img[idx] > 115) {
        pts.push({
          x,
          y,
          bit: ((rowIdx + colIdx) % 2 === 0 ? 0 : 1) as 0 | 1,
        });
      }
      colIdx++;
    }
    rowIdx++;
  }

  return pts;
}

function sampleCornerWordBox(
  word: string,
  boxLeft: number,
  boxTop: number,
  boxWidth: number,
  boxHeight: number
): { points: Point2D[]; maxX: number; maxY: number } {
  const sampleFontSize = 50;
  const off = document.createElement('canvas');
  off.width = Math.ceil(sampleFontSize * 4.6);
  off.height = Math.ceil(sampleFontSize * 2.2);
  const ctx = off.getContext('2d');
  if (!ctx) {
    return { points: [], maxX: boxLeft + boxWidth, maxY: boxTop + boxHeight };
  }

  ctx.fillStyle = '#FFFFFF';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `800 ${sampleFontSize}px Silkscreen, "JetBrains Mono", monospace`;
  ctx.fillText(word, off.width * 0.5, off.height * 0.5);

  const img = ctx.getImageData(0, 0, off.width, off.height).data;
  let minX = Infinity;
  let maxXRaw = -Infinity;
  let minY = Infinity;
  let maxYRaw = -Infinity;
  const rawPts: Point2D[] = [];
  const step = 3.6;

  let rowIdx = 0;
  for (let y = 0; y < off.height; y += step) {
    let colIdx = 0;
    for (let x = 0; x < off.width; x += step) {
      const idx = (Math.floor(y) * off.width + Math.floor(x)) * 4 + 3;
      if (img[idx] > 115) {
        rawPts.push({
          x,
          y,
          bit: ((rowIdx + colIdx) % 2 === 0 ? 0 : 1) as 0 | 1,
        });
        if (x < minX) minX = x;
        if (x > maxXRaw) maxXRaw = x;
        if (y < minY) minY = y;
        if (y > maxYRaw) maxYRaw = y;
      }
      colIdx++;
    }
    rowIdx++;
  }

  if (rawPts.length === 0) {
    return { points: [], maxX: boxLeft + boxWidth, maxY: boxTop + boxHeight };
  }

  const rawW = Math.max(1, maxXRaw - minX);
  const rawH = Math.max(1, maxYRaw - minY);
  const scale = Math.min(boxWidth / rawW, boxHeight / rawH);
  const scaledW = rawW * scale;
  const scaledH = rawH * scale;

  const offsetX = boxLeft + (boxWidth - scaledW) * 0.5;
  const offsetY = boxTop + (boxHeight - scaledH) * 0.5;

  let maxX = offsetX;
  let maxY = offsetY;

  const shifted: Point2D[] = rawPts.map((pt) => {
    const nx = offsetX + (pt.x - minX) * scale;
    const ny = offsetY + (pt.y - minY) * scale;
    if (nx > maxX) maxX = nx;
    if (ny > maxY) maxY = ny;
    return {
      x: nx,
      y: ny,
      bit: pt.bit,
    };
  });

  return { points: shifted, maxX, maxY };
}

function createGlyphSprite(
  char: '0' | '1' | '.',
  size: number,
  renderScale: number,
  color: string
): HTMLCanvasElement {
  const dim = Math.ceil(size * 1.5 * renderScale);
  const c = document.createElement('canvas');
  c.width = dim;
  c.height = dim;
  const ctx = c.getContext('2d');
  if (ctx) {
    ctx.setTransform(renderScale, 0, 0, renderScale, 0, 0);
    ctx.font = `700 ${size}px "JetBrains Mono", monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = color;
    ctx.fillText(char, (dim / renderScale) * 0.5, (dim / renderScale) * 0.5);
  }
  return c;
}

export function SlopDepsCanvas() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const skipIntroRef = useRef<(() => void) | null>(null);

  const [initialSkip] = useState<boolean>(() => shouldSkipIntroOnInit());
  const [uiPhase, setUiPhase] = useState<EnginePhase>(
    initialSkip ? 'main' : 'intro-0-slow'
  );
  const [slopDockedUi, setSlopDockedUi] = useState(false);
  const [depsDockedUi, setDepsDockedUi] = useState(false);
  const [copiedHeroChip, setCopiedHeroChip] = useState(false);

  const handleScrollToDrop = () => {
    const el = document.getElementById('slop-drop-section');
    if (el) {
      el.scrollIntoView({ behavior: 'smooth' });
    }
  };

  const handleCopyHeroChip = async () => {
    try {
      await navigator.clipboard.writeText('npx slop-deps');
    } catch {
      // Ignore clipboard permission errors
    }
    setCopiedHeroChip(true);
    window.setTimeout(() => setCopiedHeroChip(false), 1800);
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) return;

    let animationFrameId = 0;
    let width = window.innerWidth;
    let height = window.innerHeight;

    const cpuCores =
      typeof navigator !== 'undefined' ? navigator.hardwareConcurrency || 4 : 4;
    const maxDpr = cpuCores <= 4 ? 1.25 : 1.5;
    let dpr = Math.min(window.devicePixelRatio || 1, maxDpr);
    const spriteScale = 2;

    const configureViewport = () => {
      width = window.innerWidth;
      height = window.innerHeight;
      dpr = Math.min(window.devicePixelRatio || 1, maxDpr);
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.imageSmoothingEnabled = true;
    };

    configureViewport();

    const getCellMetrics = () => {
      const isMobile = width < 480;
      const compact = width < 768;
      return {
        fontSize: isMobile ? 6 : compact ? 8 : 10,
        stepX: isMobile ? 5.8 : compact ? 8 : 10,
        stepY: isMobile ? 7.2 : compact ? 10 : 12,
        cornerFontSize: isMobile ? 2.0 : compact ? 2.4 : 3.0,
      };
    };

    let metrics = getCellMetrics();
    let sprite0Core = createGlyphSprite('0', metrics.fontSize, spriteScale, MONO_CORE_COLOR);
    let sprite1Core = createGlyphSprite('1', metrics.fontSize, spriteScale, MONO_CORE_COLOR);
    let sprite0Corner = createGlyphSprite('0', metrics.cornerFontSize, spriteScale, MONO_CORE_COLOR);
    let sprite1Corner = createGlyphSprite('1', metrics.cornerFontSize, spriteScale, MONO_CORE_COLOR);
    let spriteDotSmall = createGlyphSprite('.', 10, spriteScale, MONO_DOT_SMALL);
    let spriteDotMid = createGlyphSprite('.', 13, spriteScale, MONO_DOT_MID);
    let spriteDotLarge = createGlyphSprite('.', 16, spriteScale, MONO_DOT_LARGE);

    const rebuildAllGlyphSprites = () => {
      metrics = getCellMetrics();
      sprite0Core = createGlyphSprite('0', metrics.fontSize, spriteScale, MONO_CORE_COLOR);
      sprite1Core = createGlyphSprite('1', metrics.fontSize, spriteScale, MONO_CORE_COLOR);
      sprite0Corner = createGlyphSprite('0', metrics.cornerFontSize, spriteScale, MONO_CORE_COLOR);
      sprite1Corner = createGlyphSprite('1', metrics.cornerFontSize, spriteScale, MONO_CORE_COLOR);
      spriteDotSmall = createGlyphSprite('.', 10, spriteScale, MONO_DOT_SMALL);
      spriteDotMid = createGlyphSprite('.', 13, spriteScale, MONO_DOT_MID);
      spriteDotLarge = createGlyphSprite('.', 16, spriteScale, MONO_DOT_LARGE);
    };

    const getHeroFontSize = () => {
      if (width < 480) {
        return Math.min(Math.max(width * 0.19, 70), 84);
      }
      if (width < 768) {
        return Math.min(Math.max(width * 0.17, 80), 120);
      }
      return Math.min(Math.max(width * 0.155, 98), 208);
    };

    const getIntroFontSize = () => Math.min(Math.max(width * 0.25, 180), 330);

    const buildAllPointSets = () => {
      metrics = getCellMetrics();
      const isMobile = width < 480;
      const compact = width < 768;
      const heroCenterY = isMobile ? 0.25 : compact ? 0.32 : 0.40;
      const heroScaleX = isMobile ? 1.12 : 1.22;

      const pts0 = sampleOrganizedMatrixPoints(
        ['0'],
        width,
        height,
        getIntroFontSize(),
        metrics.stepX,
        metrics.stepY,
        1.05,
        0.5
      );
      const pts1 = sampleOrganizedMatrixPoints(
        ['1'],
        width,
        height,
        getIntroFontSize(),
        metrics.stepX,
        metrics.stepY,
        1.05,
        0.5
      );
      const ptsHero = sampleOrganizedMatrixPoints(
        ['SLOP', 'DEPS'],
        width,
        height,
        getHeroFontSize(),
        metrics.stepX,
        metrics.stepY,
        heroScaleX,
        heroCenterY
      );

      const splitY = height * heroCenterY;
      const heroSlopPts = ptsHero.filter((pt) => pt.y < splitY);
      const heroDepsPts = ptsHero.filter((pt) => pt.y >= splitY);

      const slopMaxY = heroSlopPts.reduce(
        (max, p) => Math.max(max, p.y),
        height * (heroCenterY - 0.05)
      );
      const depsMaxY = heroDepsPts.reduce(
        (max, p) => Math.max(max, p.y),
        height * (heroCenterY + 0.12)
      );

      // Read exact DOM layout of the brand wordmark to guarantee zero collision with [ALPHA]
      const brandEl =
        typeof document !== 'undefined'
          ? document.querySelector('[data-testid="brand-wordmark"]')
          : null;
      const bRect = brandEl ? brandEl.getBoundingClientRect() : null;

      const cornerLeft = bRect ? bRect.left : (isMobile ? 12 : compact ? 24 : 40);
      const cornerTop = bRect ? bRect.top : (isMobile ? 19.5 : compact ? 22 : 30);
      const totalWidth = bRect ? bRect.width : (isMobile ? 74 : compact ? 80 : 94);
      const totalHeight = bRect ? bRect.height : (isMobile ? 16.5 : compact ? 18 : 20);

      const wordW = totalWidth * 0.46;
      const wordGap = totalWidth * 0.08;

      const cornerSlopBox = sampleCornerWordBox(
        'SLOP',
        cornerLeft,
        cornerTop,
        wordW,
        totalHeight
      );
      const cornerDepsBox = sampleCornerWordBox(
        'DEPS',
        cornerLeft + wordW + wordGap,
        cornerTop,
        wordW,
        totalHeight
      );

      return {
        pts0,
        pts1,
        heroSlopPts,
        heroDepsPts,
        cornerSlopPts: cornerSlopBox.points,
        cornerDepsPts: cornerDepsBox.points,
        slopMaxY,
        depsMaxY,
      };
    };

    let {
      pts0,
      pts1,
      heroSlopPts,
      heroDepsPts,
      cornerSlopPts,
      cornerDepsPts,
      slopMaxY,
      depsMaxY,
    } = buildAllPointSets();

    const particles = createInitialSwarm(
      CORE_PARTICLE_COUNT,
      BOUNCER_PARTICLE_COUNT,
      width,
      height
    );

    const pointer: Pointer3D = {
      x: width * 0.5,
      y: height * 0.5,
      normX: 0,
      normY: 0,
      active: false,
    };

    let currentPhase: EnginePhase = initialSkip ? 'main' : 'intro-0-slow';
    let phaseStartTime = performance.now();
    let burstStartTime = 0;
    let lastFrameTime = performance.now();
    let lastScrollY = window.scrollY || 0;
    let prevSlopDocked = false;
    let prevDepsDocked = false;

    // Real readiness gates: document.fonts.ready + window load + first canvas frame
    let fontsReady = false;
    let windowLoaded = document.readyState === 'complete';
    let firstFrameDrawn = false;

    const BURST_DURATION = 1100;

    const syncMainWordTargets = () => {
      assignWordPairTargets(
        particles,
        heroSlopPts,
        heroDepsPts,
        cornerSlopPts,
        cornerDepsPts
      );
      const scrollY = window.scrollY || 0;
      const dock = computeScrollDockState(scrollY, slopMaxY, depsMaxY);
      applyScrollTargets(
        particles,
        scrollY,
        0,
        dock.slopDocked,
        dock.depsDocked,
        prevSlopDocked,
        prevDepsDocked
      );
      prevSlopDocked = dock.slopDocked;
      prevDepsDocked = dock.depsDocked;
      setSlopDockedUi(dock.slopDocked);
      setDepsDockedUi(dock.depsDocked);
    };

    const snapParticlesToMainImmediate = () => {
      currentPhase = 'main';
      phaseStartTime = performance.now();
      syncMainWordTargets();
      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];
        if (p.role === 'core') {
          p.x = p.targetX;
          p.y = p.targetY;
          p.z = 0;
          p.vx = 0;
          p.vy = 0;
          p.alpha = p.targetAlpha;
        }
      }
      markIntroSeenInSession();
      setUiPhase('main');
    };

    skipIntroRef.current = () => {
      if (currentPhase !== 'main') {
        snapParticlesToMainImmediate();
      }
    };

    if (initialSkip) {
      snapParticlesToMainImmediate();
    } else {
      assignGlyphTargets(particles, pts0, true);
      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];
        p.x = p.targetX + (Math.random() - 0.5) * 32;
        p.y = p.targetY + (Math.random() - 0.5) * 32;
      }
    }

    const rebuildAfterFontsLoaded = () => {
      rebuildAllGlyphSprites();
      const built = buildAllPointSets();
      pts0 = built.pts0;
      pts1 = built.pts1;
      heroSlopPts = built.heroSlopPts;
      heroDepsPts = built.heroDepsPts;
      cornerSlopPts = built.cornerSlopPts;
      cornerDepsPts = built.cornerDepsPts;
      slopMaxY = built.slopMaxY;
      depsMaxY = built.depsMaxY;

      if (currentPhase === 'main' || currentPhase === 'expand-burst') {
        syncMainWordTargets();
      } else if (
        currentPhase === 'intro-0-slow' ||
        currentPhase === 'intro-0-fast'
      ) {
        assignGlyphTargets(particles, pts0, true);
      } else {
        assignGlyphTargets(particles, pts1, true);
      }
    };

    let cancelled = false;
    if (typeof document !== 'undefined' && 'fonts' in document && document.fonts?.ready) {
      document.fonts.ready
        .then(() => {
          if (cancelled) return;
          fontsReady = true;
          rebuildAfterFontsLoaded();
        })
        .catch(() => {
          fontsReady = true;
        });
    } else {
      fontsReady = true;
    }

    const onWindowLoad = () => {
      windowLoaded = true;
    };
    if (!windowLoaded) {
      window.addEventListener('load', onWindowLoad, { once: true });
    }

    const addMorphSwirlImpulse = (strength: number) => {
      const cx = width * 0.5;
      const cy = height * 0.5;
      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];
        const dx = p.x - cx;
        const dy = p.y - cy;
        const dist = Math.hypot(dx, dy) || 1;
        p.vx += (-dy / dist) * strength + (dx / dist) * (strength * 0.35);
        p.vy += (dx / dist) * strength + (dy / dist) * (strength * 0.35);
      }
    };

    const handleResize = () => {
      configureViewport();
      rebuildAfterFontsLoaded();
    };

    const handlePointerMove = (e: PointerEvent) => {
      pointer.x = e.clientX;
      pointer.y = e.clientY;
      pointer.normX = (e.clientX / Math.max(1, width) - 0.5) * 2;
      pointer.normY = (e.clientY / Math.max(1, height) - 0.5) * 2;
      pointer.active = true;
    };

    const handlePointerDown = (e: PointerEvent) => {
      handleSkipInput();
      pointer.x = e.clientX;
      pointer.y = e.clientY;
      pointer.normX = (e.clientX / Math.max(1, width) - 0.5) * 2;
      pointer.normY = (e.clientY / Math.max(1, height) - 0.5) * 2;
      pointer.active = true;
    };

    const handlePointerUp = () => {
      pointer.active = false;
    };

    const handlePointerLeave = () => {
      pointer.active = false;
    };

    const handleSkipInput = () => {
      if (currentPhase !== 'main') {
        snapParticlesToMainImmediate();
      }
    };

    window.addEventListener('keydown', handleSkipInput);
    window.addEventListener('pointerdown', handleSkipInput);

    const render = (now: number) => {
      if (document.hidden) {
        lastFrameTime = now;
        animationFrameId = window.requestAnimationFrame(render);
        return;
      }

      const dtMs = Math.min(32, Math.max(4, now - lastFrameTime));
      lastFrameTime = now;
      const dtScale = dtMs / 16.667;
      const elapsed = now - phaseStartTime;

      const allReady = fontsReady && windowLoaded && firstFrameDrawn;

      if (currentPhase === 'intro-0-slow' && elapsed >= 420) {
        currentPhase = 'intro-1-slow';
        phaseStartTime = now;
        addMorphSwirlImpulse(2.1);
        assignGlyphTargets(particles, pts1, true);
        setUiPhase('intro-1-slow');
      } else if (currentPhase === 'intro-1-slow' && elapsed >= 420) {
        if (allReady) {
          currentPhase = 'expand-burst';
          phaseStartTime = now;
          burstStartTime = now;
          syncMainWordTargets();
          triggerExpandBurst(particles, width, height);
          markIntroSeenInSession();
          setUiPhase('expand-burst');
        } else {
          // Keep looping 0 <-> 1 while waiting for real readiness (fonts + window load + first frame)
          currentPhase = 'intro-0-fast';
          phaseStartTime = now;
          addMorphSwirlImpulse(2.2);
          assignGlyphTargets(particles, pts0, true);
          setUiPhase('intro-0-fast');
        }
      } else if (currentPhase === 'intro-0-fast' && elapsed >= 380) {
        currentPhase = 'intro-1-fast';
        phaseStartTime = now;
        addMorphSwirlImpulse(2.2);
        assignGlyphTargets(particles, pts1, true);
        setUiPhase('intro-1-fast');
      } else if (currentPhase === 'intro-1-fast' && elapsed >= 380) {
        if (allReady) {
          currentPhase = 'expand-burst';
          phaseStartTime = now;
          burstStartTime = now;
          syncMainWordTargets();
          triggerExpandBurst(particles, width, height);
          markIntroSeenInSession();
          setUiPhase('expand-burst');
        } else {
          currentPhase = 'intro-0-fast';
          phaseStartTime = now;
          addMorphSwirlImpulse(2.0);
          assignGlyphTargets(particles, pts0, true);
          setUiPhase('intro-0-fast');
        }
      } else if (currentPhase === 'expand-burst') {
        const burstElapsed = now - burstStartTime;
        if (burstElapsed >= BURST_DURATION) {
          currentPhase = 'main';
          phaseStartTime = now;
          markIntroSeenInSession();
          setUiPhase('main');
        }
      }

      if (currentPhase === 'main') {
        const scrollY = window.scrollY || 0;
        const deltaScrollY = scrollY - lastScrollY;
        lastScrollY = scrollY;

        const dock = computeScrollDockState(scrollY, slopMaxY, depsMaxY);
        if (
          deltaScrollY !== 0 ||
          dock.slopDocked !== prevSlopDocked ||
          dock.depsDocked !== prevDepsDocked
        ) {
          applyScrollTargets(
            particles,
            scrollY,
            deltaScrollY,
            dock.slopDocked,
            dock.depsDocked,
            prevSlopDocked,
            prevDepsDocked
          );
          if (dock.slopDocked !== prevSlopDocked) {
            prevSlopDocked = dock.slopDocked;
            setSlopDockedUi(dock.slopDocked);
          }
          if (dock.depsDocked !== prevDepsDocked) {
            prevDepsDocked = dock.depsDocked;
            setDepsDockedUi(dock.depsDocked);
          }
        }
      }

      const burstProgress =
        currentPhase === 'expand-burst'
          ? Math.min(1, (now - burstStartTime) / BURST_DURATION)
          : 0;

      stepBinarySwarm(
        particles,
        currentPhase,
        width,
        height,
        pointer,
        burstProgress,
        dtScale
      );

      ctx.globalAlpha = 1;
      ctx.clearRect(0, 0, width, height);

      const isIntroBeat =
        currentPhase === 'intro-0-slow' ||
        currentPhase === 'intro-1-slow' ||
        currentPhase === 'intro-0-fast' ||
        currentPhase === 'intro-1-fast';

      const coreDim = sprite0Core.width / spriteScale;
      const halfCore = coreDim * 0.5;
      const cornerDim = sprite0Corner.width / spriteScale;
      const halfCorner = cornerDim * 0.5;

      const dotSmallDim = spriteDotSmall.width / spriteScale;
      const dotMidDim = spriteDotMid.width / spriteScale;
      const dotLargeDim = spriteDotLarge.width / spriteScale;

      const pLen = particles.length;
      for (let i = CORE_PARTICLE_COUNT; i < pLen; i++) {
        const p = particles[i];
        if (p.role !== 'bouncer') continue;

        const dotSprite =
          p.depthLayer === 0
            ? spriteDotSmall
            : p.depthLayer === 1
              ? spriteDotMid
              : spriteDotLarge;
        const dotDim =
          p.depthLayer === 0
            ? dotSmallDim
            : p.depthLayer === 1
              ? dotMidDim
              : dotLargeDim;
        const halfDot = dotDim * 0.5;

        if (isIntroBeat) {
          ctx.globalAlpha = p.alpha;
          const sprite = p.bit === 0 ? sprite0Core : sprite1Core;
          ctx.drawImage(
            sprite,
            (p.x - halfCore) | 0,
            (p.y - halfCore) | 0,
            coreDim,
            coreDim
          );
        } else if (currentPhase === 'expand-burst' && burstProgress < 0.32) {
          const t = burstProgress / 0.32;
          const sprite = p.bit === 0 ? sprite0Core : sprite1Core;
          ctx.globalAlpha = p.alpha * (1 - t);
          ctx.drawImage(
            sprite,
            (p.x - halfCore) | 0,
            (p.y - halfCore) | 0,
            coreDim,
            coreDim
          );
          ctx.globalAlpha = p.alpha * t;
          ctx.drawImage(
            dotSprite,
            (p.x - halfDot) | 0,
            (p.y - halfDot) | 0,
            dotDim,
            dotDim
          );
        } else {
          ctx.globalAlpha = p.alpha;
          ctx.drawImage(
            dotSprite,
            (p.x - halfDot) | 0,
            (p.y - halfDot) | 0,
            dotDim,
            dotDim
          );
        }
      }

      ctx.globalAlpha = 0.95;
      let currentAlpha = 0.95;

      for (let i = 0; i < CORE_PARTICLE_COUNT; i++) {
        const p = particles[i];
        if (p.alpha <= 0.01) continue;

        const mp = p.morphProgress;
        if (mp > 0.001 && mp < 0.999) {
          const dim = coreDim + (cornerDim - coreDim) * mp;
          const half = dim * 0.5;
          const sprite =
            mp < 0.65
              ? p.bit === 0
                ? sprite0Core
                : sprite1Core
              : p.bit === 0
                ? sprite0Corner
                : sprite1Corner;
          if (Math.abs(p.alpha - currentAlpha) > 0.02) {
            currentAlpha = p.alpha;
            ctx.globalAlpha = currentAlpha;
          }
          ctx.drawImage(sprite, p.x - half, p.y - half, dim, dim);
        } else if (mp >= 0.999) {
          if (currentAlpha !== 0.96) {
            currentAlpha = 0.96;
            ctx.globalAlpha = 0.96;
          }
          const sprite = p.bit === 0 ? sprite0Corner : sprite1Corner;
          ctx.drawImage(
            sprite,
            p.x - halfCorner,
            p.y - halfCorner,
            cornerDim,
            cornerDim
          );
        } else {
          if (currentAlpha !== 0.94) {
            currentAlpha = 0.94;
            ctx.globalAlpha = 0.94;
          }
          const sprite = p.bit === 0 ? sprite0Core : sprite1Core;
          ctx.drawImage(
            sprite,
            (p.x - halfCore) | 0,
            (p.y - halfCore) | 0,
            coreDim,
            coreDim
          );
        }
      }

      ctx.globalAlpha = 1;
      firstFrameDrawn = true;
      animationFrameId = window.requestAnimationFrame(render);
    };

    animationFrameId = window.requestAnimationFrame(render);

    window.addEventListener('resize', handleResize);
    window.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('pointermove', handlePointerMove, { passive: true });
    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('pointercancel', handlePointerUp);
    window.addEventListener('pointerleave', handlePointerLeave);

    return () => {
      cancelled = true;
      skipIntroRef.current = null;
      window.cancelAnimationFrame(animationFrameId);
      window.removeEventListener('load', onWindowLoad);
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('pointercancel', handlePointerUp);
      window.removeEventListener('pointerleave', handlePointerLeave);
      window.removeEventListener('keydown', handleSkipInput);
      window.removeEventListener('pointerdown', handleSkipInput);
    };
  }, [initialSkip]);

  return (
    <div
      data-testid="slop-deps-stage"
      data-phase={uiPhase}
      data-slop-docked={slopDockedUi ? 'true' : 'false'}
      data-deps-docked={depsDockedUi ? 'true' : 'false'}
      className="relative w-full min-h-screen bg-[#040507] select-none"
    >
      <h1 className="sr-only">SLOP DEPS</h1>

      <TopPixelBar
        visible={uiPhase === 'main'}
        docked={slopDockedUi}
        customImageSrc="/github-octocat.png"
      />

      <canvas
        ref={canvasRef}
        data-testid="binary-swarm-canvas"
        aria-label="SLOP DEPS interactive binary particle canvas"
        className="fixed inset-0 block w-full h-full pointer-events-none z-25"
      />

      {/* First Hero Stage with Sub-pitch, CLI chip, roadmap, and scroll prompt */}
      <div
        className={`relative z-20 min-h-screen w-full flex flex-col items-center justify-end pb-8 pt-24 px-4 transition-opacity duration-500 pointer-events-none ${
          uiPhase === 'main' ? 'opacity-100' : 'opacity-0'
        }`}
      >
        <section
          id="hero-sub-pitch"
          data-testid="hero-sub-pitch"
          className="w-full max-w-[640px] mx-auto flex flex-col items-center text-center pointer-events-auto mb-5"
        >
          <p
            data-testid="hero-subheadline"
            className="font-terminal text-sm sm:text-base md:text-lg text-[#F5F5F0]/90 tracking-tight mb-4 max-w-[480px] px-2"
          >
            Catches AI-hallucinated packages before they reach your lockfile.
          </p>

          {/* Terminal Chip with click-to-copy feedback and blinking cursor */}
          <button
            type="button"
            data-testid="hero-npx-chip"
            onClick={() => void handleCopyHeroChip()}
            className="group inline-flex items-center gap-2.5 sm:gap-3 px-4 py-2.5 sm:px-5 sm:py-3 bg-[#080A0F] border-2 border-[#F5F5F0]/45 hover:border-[#F5F5F0] text-[#F5F5F0] font-terminal text-sm sm:text-base md:text-lg pixel-btn-anim cursor-pointer"
          >
            <span>$ npx slop-deps</span>
            <span
              aria-hidden="true"
              className="inline-block w-2 sm:w-2.5 h-3.5 sm:h-4 bg-[#F5F5F0] animate-pulse"
            />
            <span
              className={`ml-1.5 sm:ml-2 px-1.5 sm:px-2 py-0.5 border border-[#F5F5F0]/30 bg-[#040507] font-pixel text-[9px] sm:text-[10px] uppercase tracking-[0.06em] transition-colors duration-150 ${
                copiedHeroChip
                  ? 'text-emerald-400 border-emerald-400/50'
                  : 'text-[#F5F5F0]/80 group-hover:text-[#F5F5F0]'
              }`}
            >
              {copiedHeroChip ? 'copied!' : 'copy'}
            </span>
          </button>

          {/* Minimal Roadmap Strip (No dates) */}
          <div
            data-testid="roadmap-strip"
            className="mt-4 sm:mt-5 w-full max-w-[480px] border border-[#F5F5F0]/20 bg-[#080A0F]/85 px-3 py-1.5 sm:px-4 sm:py-2 flex flex-wrap items-center justify-center gap-x-3 sm:gap-x-4 gap-y-1 font-terminal text-[11px] sm:text-xs text-[#F5F5F0]/65"
          >
            <span className="text-[#F5F5F0] font-bold">
              Alpha (now): CLI + drop-box demo
            </span>
            <span className="text-[#F5F5F0]/30" aria-hidden="true">
              /
            </span>
            <span>Beta: autonomous mode (coming)</span>
            <span className="text-[#F5F5F0]/30" aria-hidden="true">
              /
            </span>
            <span>Release: coming</span>
          </div>
        </section>

        <button
          type="button"
          data-testid="scroll-to-dropbox-btn"
          onClick={() => {
            const el = document.getElementById('slop-drop-section');
            if (el) {
              el.scrollIntoView({ behavior: 'smooth' });
            } else {
              window.scrollTo({
                top: window.innerHeight * 0.85,
                behavior: 'smooth',
              });
            }
          }}
          className={`pointer-events-auto group inline-flex items-center p-[2px] bg-[#F5F5F0]/35 hover:bg-[#F5F5F0] pixel-pill-clip pixel-btn-anim transition-all duration-300 cursor-pointer ${
            uiPhase === 'main' && !slopDockedUi
              ? 'opacity-100 translate-y-0'
              : 'opacity-0 translate-y-3 pointer-events-none'
          }`}
        >
          <span className="pixel-btn-sheen inline-flex items-center gap-2 px-4 py-1.5 bg-[#080A0F] text-[#F5F5F0]/85 group-hover:text-[#F5F5F0] font-pixel text-[10px] uppercase tracking-[0.1em] pixel-pill-clip">
            <span>scroll to drop files</span>
            <span className="inline-block group-hover:translate-y-0.5 transition-transform duration-150">
              ↓
            </span>
          </span>
        </button>
      </div>

      {/* Drop Box Section with comfortable separation from hero */}
      <div
        className={`relative z-20 transition-opacity duration-500 pt-20 sm:pt-32 pb-16 sm:pb-24 ${
          uiPhase === 'main' ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
      >
        <SlopDropBox />
      </div>

      {/* README Mirror Section: the GitHub README, pixel-restyled */}
      <div
        className={`relative z-20 transition-opacity duration-500 pb-16 sm:pb-24 ${
          uiPhase === 'main' ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
      >
        <ReadmeSection />
      </div>

      {/* Global Site Footer */}
      <footer
        className={`relative z-20 transition-opacity duration-500 w-full max-w-[720px] mx-auto px-4 pb-6 sm:pb-8 pt-6 border-t border-[#F5F5F0]/15 flex flex-col sm:flex-row items-center justify-between gap-4 font-terminal text-xs text-[#F5F5F0]/60 ${
          uiPhase === 'main' ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
      >
        <div className="flex items-center gap-2">
          <span className="text-[#F5F5F0] font-bold">Vidit Patil</span>
          <span className="text-[#F5F5F0]/30">·</span>
          <a
            href="https://github.com/viditx"
            target="_blank"
            rel="noreferrer"
            className="text-[#F5F5F0]/85 hover:text-[#F5F5F0] underline decoration-[#F5F5F0]/30 transition-colors"
          >
            @viditx
          </a>
          <span className="text-[#F5F5F0]/30">·</span>
          <span>MIT © 2026</span>
        </div>

        <div className="flex items-center gap-4">
          <span className="text-[#F5F5F0]/40 text-[11px] hidden sm:inline">
            zero-dependency supply-chain sentinel
          </span>
          <a
            href="https://github.com/viditx/slop-deps"
            target="_blank"
            rel="noreferrer"
            data-testid="footer-github-link"
            className="pixel-btn-anim inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#F5F5F0]/15 hover:bg-[#F5F5F0]/25 text-[#F5F5F0] font-pixel text-[9px] uppercase tracking-[0.06em] cursor-pointer"
          >
            <Github aria-hidden="true" className="w-3 h-3" strokeWidth={2.5} />
            <span>star on github</span>
          </a>
        </div>
      </footer>

      {/* Skippable Intro Indicator */}
      {uiPhase !== 'main' && (
        <button
          type="button"
          data-testid="preloader-telemetry"
          onClick={() => skipIntroRef.current?.()}
          className="fixed bottom-6 right-8 z-30 font-terminal text-xs tracking-[0.12em] text-[#EAEBE5]/65 hover:text-[#F5F5F0] cursor-pointer"
        >
          initializing · click or press any key to skip
        </button>
      )}
    </div>
  );
}
