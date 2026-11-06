import { useEffect, useState } from 'react';

export enum CatState {
  Idle = 'idle',
  Scratching = 'scratching',
  Reporting = 'reporting',
  Alert = 'alert',
  Happy = 'happy',
  Purring = 'purring',
}

interface PixelSittingCatProps {
  state?: CatState;
  isDragging?: boolean;
  isHovered?: boolean;
  lookX?: number;
  lookY?: number;
  reducedMotion?: boolean;
  customBubbleText?: string | null;
  className?: string;
}

export function PixelSittingCat({
  state = CatState.Idle,
  isDragging = false,
  isHovered = false,
  lookX = 0,
  lookY = 0,
  reducedMotion = false,
  customBubbleText,
  className = '',
}: PixelSittingCatProps) {
  const [frame, setFrame] = useState(0);
  const [blinking, setBlinking] = useState(false);
  const [petted, setPetted] = useState(false);

  useEffect(() => {
    if (reducedMotion) {
      setFrame(0);
      setBlinking(false);
      return;
    }

    const tickMs =
      state === CatState.Scratching
        ? 65
        : state === CatState.Reporting
          ? 95
          : state === CatState.Purring
            ? 140
            : isDragging
              ? 110
              : 180;

    const interval = window.setInterval(() => {
      setFrame((f) => (f + 1) % 24);
    }, tickMs);

    const blinkLoop = window.setInterval(() => {
      setBlinking(true);
      window.setTimeout(() => setBlinking(false), 130);
    }, 4400);

    return () => {
      window.clearInterval(interval);
      window.clearInterval(blinkLoop);
    };
  }, [state, isDragging, reducedMotion]);

  const handlePet = () => {
    setPetted(true);
    window.setTimeout(() => setPetted(false), 1400);
  };

  const isScratching = state === CatState.Scratching && !reducedMotion;
  const isAlert = state === CatState.Alert;
  const isHappy = state === CatState.Happy || state === CatState.Purring || petted;
  const isPurring = state === CatState.Purring;

  const tailWave = reducedMotion
    ? 0
    : isAlert
      ? frame % 2 === 0
        ? -1
        : 1
      : Math.round(Math.sin((frame / 24) * Math.PI * 2));

  const breathY = reducedMotion
    ? 0
    : isScratching
      ? frame % 2 === 0
        ? 1
        : 0
      : isPurring
        ? frame % 4 < 2
          ? 1
          : 0
        : frame % 12 >= 6
          ? 1
          : 0;

  const earFlickL =
    !reducedMotion && frame === 19 && !isDragging && state === CatState.Idle
      ? 1
      : isAlert
        ? -1
        : 0;

  const leftPawScratchOffset = isScratching ? (frame % 2 === 0 ? -3 : 2) : 0;
  const rightPawScratchOffset = isScratching ? (frame % 2 === 0 ? 2 : -3) : 0;

  const pupilDx =
    isDragging || isScratching
      ? 0
      : Math.max(-1, Math.min(1, Math.round(lookX)));
  const pupilDy =
    isDragging || isScratching || state === CatState.Reporting
      ? 1
      : isHovered
        ? 1
        : Math.max(0, Math.min(1, Math.round(lookY)));

  const statusBubbleText =
    customBubbleText !== undefined
      ? customBubbleText
      : state === CatState.Scratching
        ? 'scratching...'
        : state === CatState.Reporting
          ? 'inspecting...'
          : state === CatState.Alert
            ? '! flagged'
            : state === CatState.Purring
              ? 'purr...'
              : state === CatState.Happy
                ? 'checked'
                : isDragging
                  ? 'drop file'
                  : petted
                    ? 'purr..'
                    : null;

  return (
    <div
      data-testid="pixel-sitting-cat"
      data-cat-state={state}
      onClick={handlePet}
      role="button"
      tabIndex={0}
      aria-label={`32-bit black and white cat (${state})`}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          handlePet();
        }
      }}
      title="Click to pet"
      className={`group/cat relative z-30 inline-flex flex-col items-center cursor-pointer select-none ${className}`}
    >
      {/* Status / reaction bubble */}
      <div
        data-testid="cat-status-bubble"
        className={`mb-1 px-2 py-0.5 bg-[#080A0F] border font-pixel text-[9px] uppercase tracking-wider transition-all duration-150 pointer-events-none ${
          isAlert
            ? 'border-[#FB7185] text-[#FB7185]'
            : 'border-[#F5F5F0]/60 text-[#F5F5F0]'
        } ${
          statusBubbleText
            ? 'opacity-100 translate-y-0 scale-100'
            : 'opacity-0 translate-y-1 scale-90'
        }`}
      >
        {statusBubbleText || '...'}
      </div>

      <svg
        viewBox="0 0 68 52"
        shapeRendering="crispEdges"
        className="w-[144px] h-[110px] md:w-[166px] md:h-[126px] overflow-visible transition-transform duration-200 group-hover/cat:-translate-y-0.5"
        aria-hidden="true"
      >
        {/* ================= CONTINUOUS FLUID S-CURVE FELINE TAIL (Right side) ================= */}
        <g transform={`translate(0, ${breathY})`}>
          <rect x="42" y="41" width="7" height="5" fill="#F5F5F0" />
          <rect x="47" y={38 + tailWave} width="6" height="6" fill="#F5F5F0" />
          <rect x="51" y={34 + tailWave} width="6" height="6" fill="#F5F5F0" />
          <rect
            x={54 - tailWave}
            y={29 + tailWave}
            width="5"
            height="7"
            fill="#F5F5F0"
          />
          <rect
            x={55 - tailWave}
            y={24 + tailWave}
            width="5"
            height="6"
            fill="#F5F5F0"
          />

          <rect x="42" y="42" width="6" height="3" fill="#07090E" />
          <rect x="47" y={39 + tailWave} width="5" height="4" fill="#07090E" />
          <rect x="51" y={35 + tailWave} width="4" height="4" fill="#07090E" />
          <rect
            x={55 - tailWave}
            y={30 + tailWave}
            width="3"
            height="5"
            fill="#07090E"
          />

          <rect x="44" y="42" width="3" height="1" fill="#2A354B" />
          <rect x="48" y={39 + tailWave} width="3" height="1" fill="#2A354B" />
          <rect x="52" y={35 + tailWave} width="2" height="2" fill="#2A354B" />

          <rect
            x={56 - tailWave}
            y={25 + tailWave}
            width="3"
            height="3"
            fill="#F5F5F0"
          />
          <rect
            x={56 - tailWave}
            y={28 + tailWave}
            width="3"
            height="2"
            fill="#CBD5E1"
          />
        </g>

        {/* ================= SCULPTED FELINE BODY, HAUNCHES & CHEST ================= */}
        <path
          d="M19,25 h24 v2 h2 v4 h2 v6 h1 v10 h-32 v-10 h1 v-6 h2 v-4 h2 z"
          fill="#F5F5F0"
        />

        <path
          d="M20,26 h22 v2 h2 v4 h2 v6 h1 v8 h-30 v-8 h1 v-6 h2 v-4 h2 z"
          fill="#07090E"
        />

        <rect x="18" y="33" width="2" height="11" fill="#1E2636" />
        <rect x="19" y="29" width="2" height="5" fill="#2A354B" />
        <rect x="17" y="38" width="2" height="7" fill="#141A24" />

        <rect x="42" y="33" width="2" height="11" fill="#1E2636" />
        <rect x="41" y="29" width="2" height="5" fill="#2A354B" />
        <rect x="43" y="38" width="2" height="7" fill="#141A24" />

        <rect x="23" y="35" width="1" height="11" fill="#040507" />
        <rect x="38" y="35" width="1" height="11" fill="#040507" />
        <rect x="30" y="39" width="2" height="7" fill="#040507" />

        <g transform={`translate(0, ${breathY})`}>
          <path
            d="M24,26 h14 v4 h-1 v3 h-1 v3 h-2 v2 h-6 v-2 h-2 v-3 h-1 v-3 h-1 z"
            fill="#94A3B8"
          />
          <path
            d="M25,26 h12 v3 h-1 v3 h-1 v2 h-2 v2 h-4 v-2 h-2 v-2 h-1 v-3 h-1 z"
            fill="#F5F5F0"
          />
          <rect x="28" y="28" width="1" height="2" fill="#CBD5E1" />
          <rect x="33" y="28" width="1" height="2" fill="#CBD5E1" />
          <rect x="30" y="31" width="2" height="2" fill="#CBD5E1" />
        </g>

        {/* ================= SCULPTED FELINE HEAD, EARS & CHEEKBONES ================= */}
        <g transform={`translate(0, ${breathY})`}>
          {/* Left Pointed Feline Ear */}
          <g transform={`translate(0, ${earFlickL})`}>
            <path
              d="M18,4 h3 v2 h2 v2 h2 v6 h-9 v-6 h1 v-2 h1 z"
              fill="#F5F5F0"
            />
            <path d="M19,5 h2 v2 h2 v2 h1 v5 h-7 v-5 h1 v-2 h1 z" fill="#07090E" />
            <rect x="19" y="7" width="2" height="5" fill="#475569" />
            <rect x="20" y="8" width="2" height="4" fill="#94A3B8" />
            <rect x="20" y="10" width="3" height="1" fill="#CBD5E1" />
          </g>

          {/* Right Pointed Feline Ear */}
          <g transform={`translate(0, ${isAlert ? -1 : 0})`}>
            <path
              d="M41,4 h3 v2 h1 v2 h1 v6 h-9 v-6 h2 v-2 h2 z"
              fill="#F5F5F0"
            />
            <path d="M41,5 h2 v2 h1 v2 h1 v5 h-7 v-5 h1 v-2 h2 z" fill="#07090E" />
            <rect x="41" y="7" width="2" height="5" fill="#475569" />
            <rect x="40" y="8" width="2" height="4" fill="#94A3B8" />
            <rect x="39" y="10" width="3" height="1" fill="#CBD5E1" />
          </g>

          {/* Feline Cranium & Tapered Cheekbone Silhouette */}
          <path
            d="M22,11 h18 v2 h4 v3 h2 v5 h-1 v3 h-2 v2 h-4 v1 h-16 v-1 h-4 v-2 h-2 v-3 h-1 v-5 h2 v-3 h4 z"
            fill="#F5F5F0"
          />

          <path
            d="M23,12 h16 v2 h4 v3 h2 v4 h-1 v3 h-2 v1 h-4 v1 h-14 v-1 h-4 v-1 h-2 v-3 h-1 v-4 h2 v-3 h4 z"
            fill="#07090E"
          />

          <rect x="25" y="12" width="12" height="1" fill="#2A354B" />
          <rect x="21" y="14" width="4" height="1" fill="#2A354B" />
          <rect x="37" y="14" width="4" height="1" fill="#2A354B" />
          <rect x="18" y="19" width="2" height="3" fill="#1E2636" />
          <rect x="42" y="19" width="2" height="3" fill="#1E2636" />

          {/* Tuxedo White Nose Bridge & Sculpted Muzzle Pads */}
          <rect x="30" y="18" width="2" height="3" fill="#CBD5E1" />
          <rect x="30" y="20" width="2" height="2" fill="#F5F5F0" />
          <path
            d="M26,21 h10 v2 h1 v2 h-4 v1 h-4 v-1 h-4 v-2 h1 z"
            fill="#F5F5F0"
          />
          <rect x="26" y="21" width="2" height="1" fill="#CBD5E1" />
          <rect x="34" y="21" width="2" height="1" fill="#CBD5E1" />

          {/* Realistic Triangular Nose & Jawline Shadow */}
          <rect x="29" y="20" width="4" height="1" fill="#64748B" />
          <rect x="30" y="21" width="2" height="1" fill="#334155" />
          <rect x="30" y="22" width="2" height="2" fill="#07090E" />
          <rect x="28" y="24" width="2" height="1" fill="#475569" />
          <rect x="32" y="24" width="2" height="1" fill="#475569" />

          {/* Long Sweeping Feline Whiskers */}
          <rect x="10" y="20" width="7" height="1" fill="#F5F5F0" />
          <rect x="9" y="21" width="2" height="1" fill="#94A3B8" />
          <rect x="11" y="22" width="6" height="1" fill="#CBD5E1" />
          <rect x="9" y="23" width="3" height="1" fill="#64748B" />
          <rect x="13" y="24" width="4" height="1" fill="#94A3B8" />

          <rect x="45" y="20" width="7" height="1" fill="#F5F5F0" />
          <rect x="51" y="21" width="2" height="1" fill="#94A3B8" />
          <rect x="45" y="22" width="6" height="1" fill="#CBD5E1" />
          <rect x="50" y="23" width="3" height="1" fill="#64748B" />
          <rect x="45" y="24" width="4" height="1" fill="#94A3B8" />

          {/* ================= COOL ALMOND SLIT-PUPIL FELINE EYES ================= */}
          {isHappy ? (
            <g fill="#F5F5F0">
              <rect x="21" y="17" width="2" height="1" />
              <rect x="23" y="16" width="3" height="1" />
              <rect x="26" y="17" width="1" height="1" />

              <rect x="35" y="17" width="1" height="1" />
              <rect x="36" y="16" width="3" height="1" />
              <rect x="39" y="17" width="2" height="1" />
            </g>
          ) : blinking ? (
            <g fill="#CBD5E1">
              <rect x="21" y="17" width="6" height="1" />
              <rect x="35" y="17" width="6" height="1" />
            </g>
          ) : (
            <g>
              {/* Left Glowing Almond Eye */}
              <rect
                x="21"
                y="15"
                width="5"
                height="3"
                fill={isAlert ? '#FB7185' : '#F5F5F0'}
              />
              <rect
                x="22"
                y="16"
                width="5"
                height="3"
                fill={isAlert ? '#FB7185' : '#F5F5F0'}
              />
              <rect x="21" y="15" width="5" height="1" fill="#CBD5E1" />
              <rect
                x={23 + pupilDx}
                y={15 + pupilDy}
                width={isAlert ? '1' : '2'}
                height="4"
                fill="#040507"
              />
              <rect
                x={22 + pupilDx}
                y="15"
                width="1"
                height="1"
                fill="#FFFFFF"
              />

              {/* Right Glowing Almond Eye */}
              <rect
                x="36"
                y="15"
                width="5"
                height="3"
                fill={isAlert ? '#FB7185' : '#F5F5F0'}
              />
              <rect
                x="35"
                y="16"
                width="5"
                height="3"
                fill={isAlert ? '#FB7185' : '#F5F5F0'}
              />
              <rect x="36" y="15" width="5" height="1" fill="#CBD5E1" />
              <rect
                x={37 + pupilDx}
                y={15 + pupilDy}
                width={isAlert ? '1' : '2'}
                height="4"
                fill="#040507"
              />
              <rect
                x={36 + pupilDx}
                y="15"
                width="1"
                height="1"
                fill="#FFFFFF"
              />
            </g>
          )}
        </g>

        {/* ================= ARTICULATED WHITE FRONT PAWS (SCRATCHING OR GRIPPING) ================= */}
        {/* Left Paw */}
        <g transform={`translate(0, ${leftPawScratchOffset})`}>
          <path d="M22,44 h7 v4 h-1 v1 h-5 v-1 h-1 z" fill="#040507" />
          <path d="M23,44 h5 v3 h-5 z" fill="#F5F5F0" />
          <rect x="23" y="47" width="5" height="1" fill="#CBD5E1" />
          <rect x="24" y="45" width="1" height="3" fill="#64748B" />
          <rect x="26" y="45" width="1" height="3" fill="#64748B" />
          {isScratching && (
            <>
              <rect x="23" y="48" width="1" height="2" fill="#F5F5F0" />
              <rect x="25" y="48" width="1" height="3" fill="#F5F5F0" />
              <rect x="27" y="48" width="1" height="2" fill="#F5F5F0" />
            </>
          )}
        </g>

        {/* Right Paw */}
        <g transform={`translate(0, ${rightPawScratchOffset})`}>
          <path d="M33,44 h7 v4 h-1 v1 h-5 v-1 h-1 z" fill="#040507" />
          <path d="M34,44 h5 v3 h-5 z" fill="#F5F5F0" />
          <rect x="34" y="47" width="5" height="1" fill="#CBD5E1" />
          <rect x="35" y="45" width="1" height="3" fill="#64748B" />
          <rect x="37" y="45" width="1" height="3" fill="#64748B" />
          {isScratching && (
            <>
              <rect x="34" y="48" width="1" height="2" fill="#F5F5F0" />
              <rect x="36" y="48" width="1" height="3" fill="#F5F5F0" />
              <rect x="38" y="48" width="1" height="2" fill="#F5F5F0" />
            </>
          )}
        </g>
      </svg>
    </div>
  );
}
