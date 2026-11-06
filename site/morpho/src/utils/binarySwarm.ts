export type WordGroup = 'slop' | 'deps';

export interface BinaryParticle {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  targetX: number;
  targetY: number;
  targetZ: number;
  bit: 0 | 1;
  alpha: number;
  targetAlpha: number;
  size: number;
  phase: number;
  phaseSpeed: number;
  role: 'core' | 'bouncer';
  staggerDelay: number; // Normalized 0..0.34 delay for liquid-smooth staggered assembly
  depthLayer: 0 | 1 | 2; // 0 = deep micro-dot, 1 = mid-field dot, 2 = crisp foreground dot
  wordGroup: WordGroup;
  heroX: number;
  heroY: number;
  heroAlpha: number;
  heroBit: 0 | 1;
  cornerX: number;
  cornerY: number;
  cornerAlpha: number;
  cornerBit: 0 | 1;
  inCorner: boolean;
  orderNorm: number; // 0..1 individual peel-off sequence order
  launchTimer: number; // Per-particle wave timer for one-by-one launch
  morphProgress: number; // 0 = in hero word, 0..1 = rising upward along Bezier arc, 1 = docked in corner
  launchX: number; // Exact on-screen X when individual launch begins
  launchY: number; // Exact on-screen Y when individual launch begins
}

export interface Point2D {
  x: number;
  y: number;
  bit?: 0 | 1;
}

export interface ScrollDockState {
  slopDocked: boolean;
  depsDocked: boolean;
  slopExitScrollY: number;
  depsExitScrollY: number;
}

export type EnginePhase =
  | 'intro-0-slow' // 0.8s
  | 'intro-1-slow' // 0.8s
  | 'intro-0-fast' // 0.6s
  | 'intro-1-fast' // 0.6s
  | 'expand-burst' // '1' expands outward to hit screen edges & ricochets into SLOP DEPS
  | 'main';        // Dense '.' dot field slowly & steadily drifts and bounces off screen edges + SLOP DEPS locked

export interface Pointer3D {
  x: number;
  y: number;
  normX: number; // -1 to 1
  normY: number; // -1 to 1
  active: boolean;
}

const TWO_PI = Math.PI * 2;

/**
 * Fast parabolic sine approximation for shimmer phases (-1 to 1) to avoid thousands of Math.sin calls per frame on low-end CPUs.
 */
function fastSin(rad: number): number {
  let x = rad % TWO_PI;
  if (x > Math.PI) x -= TWO_PI;
  else if (x < -Math.PI) x += TWO_PI;
  const y = 1.27323954 * x - 0.405284735 * x * Math.abs(x);
  return 0.225 * (y * Math.abs(y) - y) + y;
}

/**
 * Triggers the radial shockwave expansion from the center '1' shape so particles expand outward
 * across all 360 degrees to hit the screen edges and bounce off the walls.
 */
export function triggerExpandBurst(
  particles: BinaryParticle[],
  width: number,
  height: number,
  rng: () => number = Math.random
): void {
  const cx = width * 0.5;
  const cy = height * 0.5;

  for (let i = 0; i < particles.length; i++) {
    const p = particles[i];
    const dx = p.x - cx;
    const dy = p.y - cy;
    const dist = Math.hypot(dx, dy);

    const baseAngle = dist > 2 ? Math.atan2(dy, dx) : (i / particles.length) * TWO_PI;
    const angle = baseAngle + (rng() - 0.5) * 0.65;
    const speed =
      p.role === 'bouncer'
        ? 11 + rng() * 17
        : 13.5 + rng() * 13;

    p.vx = Math.cos(angle) * speed;
    p.vy = Math.sin(angle) * speed;
    p.vz = 0;

    if (p.role === 'bouncer') {
      p.targetAlpha =
        p.depthLayer === 0
          ? 0.16 + rng() * 0.16
          : p.depthLayer === 1
            ? 0.28 + rng() * 0.22
            : 0.48 + rng() * 0.26;
      p.alpha = 0.76;
    } else {
      p.alpha = 0.94;
    }
  }
}

/**
 * High-efficiency physics step optimized for integrated GPUs and low-end CPUs (Intel i3+):
 * - Precomputes exponential damping factors outside the loop (eliminating 7,000+ Math.pow calls/frame).
 * - Uses fast bounding-box checks before squared-distance checks on cursor repulsion.
 * - Uses fastSin for alpha shimmer and skips redundant trig/sqrt calls on steady-drifting bouncers.
 */
export function stepBinarySwarm(
  particles: BinaryParticle[],
  phase: EnginePhase,
  width: number,
  height: number,
  pointer: Pointer3D,
  burstProgress: number,
  dtScale = 1
): void {
  const repulsionRadius = 90;
  const repulsionRadiusSq = repulsionRadius * repulsionRadius;
  const cornerRepelRadius = 55;
  const cornerRepelRadiusSq = cornerRepelRadius * cornerRepelRadius;
  const wallPad = 6;
  const rightWall = width - wallPad;
  const bottomWall = height - wallPad;

  const ptrActive = pointer.active;
  const ptrX = pointer.x;
  const ptrY = pointer.y;
  const parallaxX = ptrActive ? pointer.normX * 14 : 0;
  const parallaxY = ptrActive ? pointer.normY * 10 : 0;

  // Precompute frame-level damping powers once per frame instead of per particle
  const burstDrag = dtScale === 1 ? 0.968 : Math.pow(0.968, dtScale);
  const dampHero = dtScale === 1 ? 0.72 : Math.pow(0.72, dtScale);
  const dampCorner = dtScale === 1 ? 0.68 : Math.pow(0.68, dtScale);

  const len = particles.length;
  for (let i = 0; i < len; i++) {
    const p = particles[i];
    p.phase += p.phaseSpeed * dtScale;

    // 1. EXPAND-BURST PHASE: '1' expands outward, hits screen walls, and seamlessly curves into SLOP DEPS
    if (phase === 'expand-burst') {
      if (p.role === 'core' && burstProgress > 0.34) {
        const rawT = (burstProgress - 0.34 - p.staggerDelay * 0.42) * 1.85185;
        const localT = rawT < 0 ? 0 : rawT > 1 ? 1 : rawT;
        const smoothT =
          localT * localT * localT * (localT * (localT * 6 - 15) + 10);
        const pullStrength = smoothT * 0.155;

        const dxTarget = p.targetX - p.x;
        const dyTarget = p.targetY - p.y;

        const arcFactor = (1 - smoothT) * 0.028;
        const fx = dxTarget * pullStrength - dyTarget * arcFactor;
        const fy = dyTarget * pullStrength + dxTarget * arcFactor;

        const drag = 0.94 - smoothT * 0.21;
        p.vx = (p.vx + fx * dtScale) * drag;
        p.vy = (p.vy + fy * dtScale) * drag;
      } else {
        p.vx *= burstDrag;
        p.vy *= burstDrag;
      }

      p.x += p.vx * dtScale;
      p.y += p.vy * dtScale;

      if (p.x <= wallPad) {
        p.x = wallPad;
        p.vx = Math.abs(p.vx) * 0.86;
      } else if (p.x >= rightWall) {
        p.x = rightWall;
        p.vx = -Math.abs(p.vx) * 0.86;
      }

      if (p.y <= wallPad) {
        p.y = wallPad;
        p.vy = Math.abs(p.vy) * 0.86;
      } else if (p.y >= bottomWall) {
        p.y = bottomWall;
        p.vy = -Math.abs(p.vy) * 0.86;
      }

      if (p.role === 'bouncer') {
        const a = 0.76 - burstProgress * 0.42;
        p.alpha = a > p.targetAlpha ? a : p.targetAlpha;
      } else {
        p.alpha =
          p.targetAlpha > 0.01
            ? 0.92
            : Math.max(0, 0.92 * (1 - burstProgress * 1.4));
      }
      continue;
    }

    // 2. BACKGROUND BOUNCER DOTS ('.'): High-quantity 3-layer depth field moving slowly & steadily + gentle edge bounce
    if (p.role === 'bouncer' && phase === 'main') {
      const steadySpeed =
        p.depthLayer === 0
          ? 0.16 + (i & 3) * 0.035
          : p.depthLayer === 1
            ? 0.24 + (i % 5) * 0.045
            : 0.34 + (i & 3) * 0.05;

      // Only normalize velocity if speed deviates noticeably from steadySpeed (avoids 902 Math.sqrt calls/frame)
      const speedSq = p.vx * p.vx + p.vy * p.vy;
      const steadySq = steadySpeed * steadySpeed;
      if (speedSq > steadySq * 1.35 || speedSq < steadySq * 0.65) {
        if (speedSq > 0.00001) {
          const invSpeed = steadySpeed / Math.sqrt(speedSq);
          p.vx += (p.vx * invSpeed - p.vx) * 0.12 * dtScale;
          p.vy += (p.vy * invSpeed - p.vy) * 0.12 * dtScale;
        } else {
          const angle = (i * 1.6180339) % TWO_PI;
          p.vx = Math.cos(angle) * steadySpeed;
          p.vy = Math.sin(angle) * steadySpeed;
        }
      }

      // Fast AABB pre-filter before squared distance check for pointer wake
      if (ptrActive) {
        const dx = p.x - ptrX;
        if (dx < repulsionRadius && dx > -repulsionRadius) {
          const dy = p.y - ptrY;
          if (dy < repulsionRadius && dy > -repulsionRadius) {
            const dSq = dx * dx + dy * dy;
            if (dSq > 0.001 && dSq < repulsionRadiusSq) {
              const d = Math.sqrt(dSq);
              const falloff = 1 - d / repulsionRadius;
              const wake = falloff * falloff * 0.088 * (p.depthLayer + 1);
              p.vx += (dx / d) * wake * dtScale;
              p.vy += (dy / d) * wake * dtScale;
            }
          }
        }
      }

      p.x += p.vx * dtScale;
      p.y += p.vy * dtScale;

      if (p.x <= wallPad) {
        p.x = wallPad;
        p.vx = Math.abs(p.vx);
      } else if (p.x >= rightWall) {
        p.x = rightWall;
        p.vx = -Math.abs(p.vx);
      }

      if (p.y <= wallPad) {
        p.y = wallPad;
        p.vy = Math.abs(p.vy);
      } else if (p.y >= bottomWall) {
        p.y = bottomWall;
        p.vy = -Math.abs(p.vy);
      }

      const shimmer = fastSin(p.phase) * 0.06;
      const nextAlpha = p.targetAlpha + shimmer;
      p.alpha = nextAlpha < 0.1 ? 0.1 : nextAlpha > 0.75 ? 0.75 : nextAlpha;
      continue;
    }

    // 3. CORE GLYPH PARTICLES ('0' and '1' inside intro 0/1 and main SLOP DEPS)
    if (phase === 'main') {
      if (p.inCorner) {
        if (p.morphProgress < 1) {
          p.launchTimer = Math.min(0.8, p.launchTimer + 0.042 * dtScale);
          if (p.launchTimer >= p.orderNorm * 0.55) {
            if (p.morphProgress <= 0.0001) {
              p.launchX = p.x;
              p.launchY = p.y;
            }
            p.morphProgress = Math.min(1, p.morphProgress + 0.056 * dtScale);
          }
        }
      } else if (p.launchTimer > 0 || p.morphProgress > 0) {
        p.launchTimer = Math.max(0, p.launchTimer - 0.058 * dtScale);
        if (p.launchTimer <= p.orderNorm * 0.55) {
          p.morphProgress = Math.max(0, p.morphProgress - 0.065 * dtScale);
          if (p.morphProgress <= 0.0001) {
            p.launchX = p.heroX;
            p.launchY = p.targetY;
          }
        }
      }

      // Mid-flight upward-rising Cubic Bezier arc
      if (p.morphProgress > 0.001 && p.morphProgress < 0.999) {
        const t = p.morphProgress;
        const u = t * t * (3 - 2 * t);

        const sx = p.launchX;
        const sy = p.launchY;
        const ex = p.cornerX + parallaxX * 0.04;
        const ey = p.cornerY + parallaxY * 0.04;

        const waveOffset = fastSin(p.orderNorm * 31.4 + (i % 7)) * 22;
        const liftUp = 90 + (i % 11) * 6;
        const p1x = sx - (sx - ex) * 0.16 + waveOffset;
        const p1y = Math.max(16, sy - liftUp);

        const p2x = ex + (sx - ex) * 0.24;
        const p2y = Math.max(14, Math.min(ey + 14, sy - 60) - (i % 7) * 3);

        const inv = 1 - u;
        const inv2 = inv * inv;
        const u2 = u * u;
        const b0 = inv2 * inv;
        const b1 = 3 * inv2 * u;
        const b2 = 3 * inv * u2;
        const b3 = u2 * u;

        p.x = b0 * sx + b1 * p1x + b2 * p2x + b3 * ex;
        p.y = b0 * sy + b1 * p1y + b2 * p2y + b3 * ey;
        p.vx = 0;
        p.vy = 0;
        p.bit = u > 0.55 ? p.cornerBit : p.heroBit;

        if (p.cornerAlpha <= 0.01) {
          p.alpha = p.heroAlpha * (1 - u2);
        } else {
          p.alpha = 0.96;
        }
        continue;
      }
    }

    const isSettledInCorner = phase === 'main' && p.morphProgress >= 0.999;
    const activeTargetAlpha = isSettledInCorner ? p.cornerAlpha : p.targetAlpha;

    // Fast skip for hidden excess core particles in corner mode
    if (phase === 'main' && activeTargetAlpha <= 0.01) {
      p.alpha = 0;
      continue;
    }

    const parallaxFactor = isSettledInCorner ? 0.04 : 0.16;
    const baseGoalX = isSettledInCorner ? p.cornerX : p.targetX;
    const baseGoalY = isSettledInCorner ? p.cornerY : p.targetY;
    const goalX = baseGoalX + (phase === 'main' ? parallaxX * parallaxFactor : 0);
    const goalY = baseGoalY + (phase === 'main' ? parallaxY * parallaxFactor : 0);

    const stiffness = phase === 'main' ? (isSettledInCorner ? 0.24 : 0.18) : 0.22;
    const damp = phase === 'main' ? (isSettledInCorner ? dampCorner : dampHero) : dampCorner;

    let fx = (goalX - p.x) * stiffness;
    let fy = (goalY - p.y) * stiffness;

    // Tactile magnetic cursor disturbance on SLOP DEPS with fast bounding-box rejection
    if (phase === 'main' && ptrActive) {
      const dx = p.x - ptrX;
      const activeRadius = isSettledInCorner ? cornerRepelRadius : repulsionRadius;
      if (dx < activeRadius && dx > -activeRadius) {
        const dy = p.y - ptrY;
        if (dy < activeRadius && dy > -activeRadius) {
          const activeRadiusSq = isSettledInCorner ? cornerRepelRadiusSq : repulsionRadiusSq;
          const dSq = dx * dx + dy * dy;
          if (dSq > 0.001 && dSq < activeRadiusSq) {
            const d = Math.sqrt(dSq);
            const falloff = 1 - d / activeRadius;
            const push = falloff * falloff * (isSettledInCorner ? 2.1 : 3.8);
            fx += (dx / d) * push;
            fy += (dy / d) * push;
          }
        }
      }
    }

    p.vx = (p.vx + fx * dtScale) * damp;
    p.vy = (p.vy + fy * dtScale) * damp;

    p.x += p.vx * dtScale;
    p.y += p.vy * dtScale;

    if (phase === 'main' && p.morphProgress <= 0.001) {
      p.launchX = p.x;
      p.launchY = p.y;
    }

    p.bit = isSettledInCorner ? p.cornerBit : p.heroBit;
    p.alpha = activeTargetAlpha;
  }
}

export function createInitialSwarm(
  coreCount: number,
  bouncerCount: number,
  width: number,
  height: number,
  rng: () => number = Math.random
): BinaryParticle[] {
  const particles: BinaryParticle[] = [];
  const halfCore = Math.floor(coreCount * 0.5);

  for (let i = 0; i < coreCount; i++) {
    const bit: 0 | 1 = i % 2 === 0 ? 0 : 1;
    const cx = width * 0.5;
    const cy = height * 0.5;
    const groupIdx = i < halfCore ? i : i - halfCore;
    const groupLen = Math.max(1, i < halfCore ? halfCore : coreCount - halfCore);
    particles.push({
      x: cx + (rng() - 0.5) * width * 0.32,
      y: cy + (rng() - 0.5) * height * 0.32,
      z: 0,
      vx: 0,
      vy: 0,
      vz: 0,
      targetX: cx,
      targetY: cy,
      targetZ: 0,
      bit,
      alpha: 0.92,
      targetAlpha: 0.92,
      size: 11,
      phase: rng() * TWO_PI,
      phaseSpeed: 0.022 + rng() * 0.025,
      role: 'core',
      staggerDelay: (i % 24) / 72,
      depthLayer: 2,
      wordGroup: i < halfCore ? 'slop' : 'deps',
      heroX: cx,
      heroY: cy,
      heroAlpha: 0.94,
      heroBit: bit,
      cornerX: 40,
      cornerY: 40,
      cornerAlpha: 0,
      cornerBit: bit,
      inCorner: false,
      orderNorm: groupIdx / groupLen,
      launchTimer: 0,
      morphProgress: 0,
      launchX: cx,
      launchY: cy,
    });
  }

  for (let i = 0; i < bouncerCount; i++) {
    const roll = i % 10;
    const depthLayer: 0 | 1 | 2 = roll < 5 ? 0 : roll < 8 ? 1 : 2;
    const angle = rng() * TWO_PI;
    const speed =
      depthLayer === 0
        ? 0.18 + rng() * 0.14
        : depthLayer === 1
          ? 0.25 + rng() * 0.18
          : 0.34 + rng() * 0.2;

    const baseAlpha =
      depthLayer === 0
        ? 0.18 + rng() * 0.16
        : depthLayer === 1
          ? 0.3 + rng() * 0.22
          : 0.48 + rng() * 0.26;
    const bit: 0 | 1 = i % 2 === 0 ? 0 : 1;

    particles.push({
      x: rng() * (width - 24) + 12,
      y: rng() * (height - 24) + 12,
      z: depthLayer === 0 ? 360 : depthLayer === 1 ? 200 : 80,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      vz: 0,
      targetX: width * 0.5,
      targetY: height * 0.5,
      targetZ: 0,
      bit,
      alpha: baseAlpha,
      targetAlpha: baseAlpha,
      size: depthLayer === 0 ? 8 : depthLayer === 1 ? 10 : 12,
      phase: rng() * TWO_PI,
      phaseSpeed: 0.012 + rng() * 0.018,
      role: 'bouncer',
      staggerDelay: (i % 16) / 64,
      depthLayer,
      wordGroup: 'slop',
      heroX: width * 0.5,
      heroY: height * 0.5,
      heroAlpha: baseAlpha,
      heroBit: bit,
      cornerX: 0,
      cornerY: 0,
      cornerAlpha: 0,
      cornerBit: bit,
      inCorner: false,
      orderNorm: 0,
      launchTimer: 0,
      morphProgress: 0,
      launchX: width * 0.5,
      launchY: height * 0.5,
    });
  }

  return particles;
}

/**
 * Spatial-sorted target assignment:
 * Sorts both active particles and target glyph coordinates spatially so during 0 <-> 1 morphs
 * and SLOP DEPS assembly, particles glide along minimal, non-crossing laminar paths.
 */
export function assignGlyphTargets(
  particles: BinaryParticle[],
  points: Point2D[],
  includeBouncers = false
): void {
  if (points.length === 0) return;

  const sortedPoints = [...points].sort((a, b) =>
    Math.abs(a.y - b.y) > 6 ? a.y - b.y : a.x - b.x
  );

  const coreParticles: BinaryParticle[] = [];
  for (let i = 0; i < particles.length; i++) {
    const p = particles[i];
    p.inCorner = false;
    p.launchTimer = 0;
    p.morphProgress = 0;
    if (p.role === 'core') {
      coreParticles.push(p);
    } else if (includeBouncers) {
      const pt = sortedPoints[i % sortedPoints.length];
      p.targetX = pt.x;
      p.targetY = pt.y;
      p.targetZ = 0;
      if (pt.bit !== undefined) p.bit = pt.bit;
      p.targetAlpha = 0.88;
    }
  }

  coreParticles.sort((a, b) =>
    Math.abs(a.y - b.y) > 8 ? a.y - b.y : a.x - b.x
  );

  const count = sortedPoints.length;
  for (let i = 0; i < coreParticles.length; i++) {
    const p = coreParticles[i];
    if (i < count) {
      const pt = sortedPoints[i];
      p.targetX = pt.x;
      p.targetY = pt.y;
      p.targetZ = 0;
      p.heroX = pt.x;
      p.heroY = pt.y;
      p.launchX = pt.x;
      p.launchY = pt.y;
      if (pt.bit !== undefined) {
        p.bit = pt.bit;
        p.heroBit = pt.bit;
      }
      p.targetAlpha = 0.94;
      p.heroAlpha = 0.94;
      p.staggerDelay = (i / Math.max(1, count)) * 0.28;
    } else {
      const pt = sortedPoints[i % count];
      p.targetX = pt.x;
      p.targetY = pt.y;
      p.targetZ = 0;
      p.heroX = pt.x;
      p.heroY = pt.y;
      p.launchX = pt.x;
      p.launchY = pt.y;
      if (pt.bit !== undefined) {
        p.bit = pt.bit;
        p.heroBit = pt.bit;
      }
      p.targetAlpha = 0;
      p.heroAlpha = 0;
      p.staggerDelay = 0.2;
    }
  }
}

/**
 * Assigns separate SLOP and DEPS hero & top-left corner matrix coordinates to their respective core particle groups,
 * ordering each particle's `orderNorm` so individual 0s and 1s peel off one by one from top-left to bottom-right.
 */
export function assignWordPairTargets(
  particles: BinaryParticle[],
  heroSlopPts: Point2D[],
  heroDepsPts: Point2D[],
  cornerSlopPts: Point2D[],
  cornerDepsPts: Point2D[]
): void {
  const sortPts = (pts: Point2D[]) =>
    [...pts].sort((a, b) => (Math.abs(a.y - b.y) > 4 ? a.y - b.y : a.x - b.x));

  const sHero = sortPts(heroSlopPts);
  const dHero = sortPts(heroDepsPts);
  const sCorner = sortPts(cornerSlopPts);
  const dCorner = sortPts(cornerDepsPts);

  const slopParticles: BinaryParticle[] = [];
  const depsParticles: BinaryParticle[] = [];

  for (let i = 0; i < particles.length; i++) {
    const p = particles[i];
    if (p.role !== 'core') continue;
    if (p.wordGroup === 'slop') {
      slopParticles.push(p);
    } else {
      depsParticles.push(p);
    }
  }

  const bindGroup = (
    group: BinaryParticle[],
    heroPts: Point2D[],
    cornerPts: Point2D[]
  ) => {
    group.sort((a, b) => (Math.abs(a.y - b.y) > 8 ? a.y - b.y : a.x - b.x));
    const hLen = heroPts.length;
    const cLen = cornerPts.length;

    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (let i = 0; i < hLen; i++) {
      if (heroPts[i].x < minX) minX = heroPts[i].x;
      if (heroPts[i].x > maxX) maxX = heroPts[i].x;
      if (heroPts[i].y < minY) minY = heroPts[i].y;
      if (heroPts[i].y > maxY) maxY = heroPts[i].y;
    }
    const spanX = Math.max(1, maxX - minX);
    const spanY = Math.max(1, maxY - minY);

    for (let i = 0; i < group.length; i++) {
      const p = group[i];
      if (hLen > 0 && i < hLen) {
        const hp = heroPts[i];
        p.heroX = hp.x;
        p.heroY = hp.y;
        p.heroBit = hp.bit ?? (i % 2 === 0 ? 0 : 1);
        p.heroAlpha = 0.94;
        p.staggerDelay = (i / Math.max(1, hLen)) * 0.28;

        const normY = (hp.y - minY) / spanY;
        const normX = (hp.x - minX) / spanX;
        const bitScatter = ((i * 29) % 19) / 19;
        p.orderNorm = Math.min(
          1,
          Math.max(0, normY * 0.46 + normX * 0.36 + bitScatter * 0.18)
        );
      } else if (hLen > 0) {
        const hp = heroPts[i % hLen];
        p.heroX = hp.x;
        p.heroY = hp.y;
        p.heroBit = hp.bit ?? 0;
        p.heroAlpha = 0;
        p.staggerDelay = 0.2;
        p.orderNorm = (i % hLen) / Math.max(1, hLen);
      }

      if (cLen > 0 && i < cLen) {
        const cp = cornerPts[i];
        p.cornerX = cp.x;
        p.cornerY = cp.y;
        p.cornerBit = cp.bit ?? (i % 2 === 0 ? 0 : 1);
        p.cornerAlpha = 0.96;
      } else if (cLen > 0) {
        const mappedIdx = Math.min(
          cLen - 1,
          Math.floor((i / Math.max(1, hLen)) * cLen)
        );
        const cp = cornerPts[mappedIdx];
        p.cornerX = cp.x;
        p.cornerY = cp.y;
        p.cornerBit = cp.bit ?? 0;
        p.cornerAlpha = 0;
      } else {
        p.cornerAlpha = 0;
      }

      p.targetX = p.heroX;
      p.targetY = p.heroY;
      p.launchX = p.heroX;
      p.launchY = p.heroY;
      p.targetZ = 0;
      p.bit = p.inCorner ? p.cornerBit : p.heroBit;
      p.targetAlpha = p.heroAlpha;
    }
  };

  bindGroup(slopParticles, sHero, sCorner);
  bindGroup(depsParticles, dHero, dCorner);
}

export function computeScrollDockState(
  scrollY: number,
  slopMaxY: number,
  depsMaxY: number
): ScrollDockState {
  const slopExitScrollY = Math.max(85, Math.floor(slopMaxY * 0.52));
  const depsExitScrollY = Math.max(slopExitScrollY + 65, Math.floor(depsMaxY * 0.78));

  return {
    slopDocked: scrollY >= slopExitScrollY,
    depsDocked: scrollY >= depsExitScrollY,
    slopExitScrollY,
    depsExitScrollY,
  };
}

export function applyScrollTargets(
  particles: BinaryParticle[],
  scrollY: number,
  deltaScrollY: number,
  slopDocked: boolean,
  depsDocked: boolean,
  _prevSlopDocked: boolean,
  _prevDepsDocked: boolean
): void {
  for (let i = 0; i < particles.length; i++) {
    const p = particles[i];
    if (p.role !== 'core') continue;

    const isSlop = p.wordGroup === 'slop';
    const docked = isSlop ? slopDocked : depsDocked;

    p.inCorner = docked;
    p.targetX = p.heroX;
    p.targetY = Math.max(isSlop ? 120 : 185, p.heroY - scrollY * 0.58);
    p.targetAlpha = p.heroAlpha;

    if (!docked && p.morphProgress <= 0.001 && deltaScrollY !== 0) {
      p.y = p.targetY;
      p.launchX = p.x;
      p.launchY = p.y;
    }
  }
}
