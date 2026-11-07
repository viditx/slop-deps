"use client";

import React, { useState, useCallback, useRef } from "react";

export interface HeroTerminalOverlayProps {
  /** CLI command displayed and copied (default: "npx slop-deps") */
  command?: string;
  /** Target DOM element ID for the bottom smooth-scroll trigger */
  targetScrollId?: string;
  /** Enables or disables the synthesized Web Audio API 8-bit micro-chirp */
  enableAudio?: boolean;
  /** Duration in milliseconds for the copied confirmation state */
  copyResetMs?: number;
  /** Optional callback fired when the CLI command is copied */
  onCommandCopy?: (command: string) => void;
  /** Optional additional className */
  className?: string;
}

/**
 * 16-bit stepped pixel corner polygon (6px two-step notch)
 */
const STEPPED_CHIP_CLIP =
  "polygon(0 6px, 3px 6px, 3px 3px, 6px 3px, 6px 0, calc(100% - 6px) 0, calc(100% - 6px) 3px, calc(100% - 3px) 3px, calc(100% - 3px) 6px, 100% 6px, 100% calc(100% - 6px), calc(100% - 3px) calc(100% - 6px), calc(100% - 3px) calc(100% - 3px), calc(100% - 6px) calc(100% - 3px), calc(100% - 6px) 100%, 6px 100%, 6px calc(100% - 3px), 3px calc(100% - 3px), 3px calc(100% - 6px), 0 calc(100% - 6px))";

const STEPPED_PILL_CLIP =
  "polygon(0 4px, 2px 4px, 2px 2px, 4px 2px, 4px 0, calc(100% - 4px) 0, calc(100% - 4px) 2px, calc(100% - 2px) 2px, calc(100% - 2px) 4px, 100% 4px, 100% calc(100% - 4px), calc(100% - 2px) calc(100% - 4px), calc(100% - 2px) calc(100% - 2px), calc(100% - 4px) calc(100% - 2px), calc(100% - 4px) 100%, 4px 100%, 4px calc(100% - 2px), 2px calc(100% - 2px), 2px calc(100% - 4px), 0 calc(100% - 4px))";

type WebkitWindow = Window &
  typeof globalThis & {
    webkitAudioContext?: typeof AudioContext;
  };

function triggerEightBitCopyChirp(audioCtxRef: React.MutableRefObject<AudioContext | null>): void {
  if (typeof window === "undefined") return;

  try {
    const AudioCtxClass =
      window.AudioContext || (window as WebkitWindow).webkitAudioContext;
    if (!AudioCtxClass) return;

    if (!audioCtxRef.current || audioCtxRef.current.state === "closed") {
      audioCtxRef.current = new AudioCtxClass();
    }

    const ctx = audioCtxRef.current;
    if (ctx.state === "suspended") {
      void ctx.resume();
    }

    const now = ctx.currentTime;
    const notes = [
      { freq: 880.0, start: 0.0, dur: 0.042 },
      { freq: 1318.51, start: 0.042, dur: 0.048 },
      { freq: 1760.0, start: 0.09, dur: 0.065 },
    ];

    for (const note of notes) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "square";
      osc.frequency.setValueAtTime(note.freq, now + note.start);

      gain.gain.setValueAtTime(0.048, now + note.start);
      gain.gain.exponentialRampToValueAtTime(0.001, now + note.start + note.dur);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now + note.start);
      osc.stop(now + note.start + note.dur);
    }
  } catch {
    // Graceful fallback
  }
}

export const HeroTerminalOverlay: React.FC<HeroTerminalOverlayProps> = ({
  command = "npx slop-deps",
  targetScrollId = "audit-dropzone",
  enableAudio = true,
  copyResetMs = 2000,
  onCommandCopy,
  className = "",
}) => {
  const [copied, setCopied] = useState<boolean>(false);
  const copyTimeoutRef = useRef<number | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);

  const handleCopyCommand = useCallback(async () => {
    if (enableAudio) {
      triggerEightBitCopyChirp(audioCtxRef);
    }

    try {
      if (typeof navigator !== "undefined" && navigator.clipboard) {
        await navigator.clipboard.writeText(command);
      } else if (typeof document !== "undefined") {
        const textArea = document.createElement("textarea");
        textArea.value = command;
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand("copy");
        document.body.removeChild(textArea);
      }
    } catch {
      // Continue state transition
    }

    setCopied(true);
    onCommandCopy?.(command);

    if (copyTimeoutRef.current !== null) {
      window.clearTimeout(copyTimeoutRef.current);
    }

    copyTimeoutRef.current = window.setTimeout(() => {
      setCopied(false);
      copyTimeoutRef.current = null;
    }, copyResetMs);
  }, [command, copyResetMs, enableAudio, onCommandCopy]);

  const handleScrollToDropzone = useCallback(() => {
    const targetEl = document.getElementById(targetScrollId);
    if (targetEl) {
      targetEl.scrollIntoView({ behavior: "smooth", block: "start" });
    } else {
      window.scrollTo({
        top: window.innerHeight,
        behavior: "smooth",
      });
    }
  }, [targetScrollId]);

  return (
    <div
      className={`pointer-events-none absolute inset-0 z-20 flex h-full w-full flex-col justify-end select-none ${className}`}
      style={{
        fontFamily: "'JetBrains Mono', ui-monospace, SFMono-Regular, monospace",
      }}
    >
      <style>{`
        @keyframes slopCursorBlink {
          0%, 49% { opacity: 1; }
          50%, 100% { opacity: 0; }
        }
        @keyframes slopSteppedBounce {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(5px); }
        }
        .slop-cursor-blink {
          animation: slopCursorBlink 1s steps(2, start) infinite;
        }
        .slop-stepped-bounce {
          animation: slopSteppedBounce 1.4s steps(3, end) infinite;
        }
      `}</style>

      {/* Terminal chip container positioned in lower section */}
      <div className="relative flex w-full flex-col items-center justify-end px-4 pb-10 sm:pb-12 pointer-events-none">
        {/* Terminal chip */}
        <div className="pointer-events-auto mb-10">
          <div
            className={`inline-block p-[1px] transition-colors duration-200 ${
              copied
                ? "bg-[#22C55E] shadow-[0_0_30px_rgba(34,197,94,0.35)]"
                : "bg-white/15 hover:bg-white/40"
            }`}
            style={{ clipPath: STEPPED_CHIP_CLIP }}
          >
            <button
              type="button"
              onClick={handleCopyCommand}
              aria-label={`Copy CLI command ${command} to clipboard`}
              className={`group relative flex items-center justify-center gap-3 px-6 py-3 min-w-[260px] sm:min-w-[290px] text-sm sm:text-base font-medium tracking-wider transition-all duration-150 cursor-pointer focus:outline-none ${
                copied
                  ? "bg-[#040507] text-[#22C55E]"
                  : "bg-[#040507] text-[#F5F5F0] hover:bg-[#080B10] active:translate-y-[1px]"
              }`}
              style={{ clipPath: STEPPED_CHIP_CLIP }}
            >
              {copied ? (
                <span className="flex items-center gap-2 font-semibold tracking-[0.12em] text-[#22C55E]">
                  <span>✓ COPIED TO CLIPBOARD</span>
                </span>
              ) : (
                <span className="flex items-center gap-2.5">
                  <span className="text-[#22C55E] font-bold select-none">$</span>
                  <span className="text-[#F5F5F0] font-semibold tracking-[0.06em]">
                    {command}
                  </span>
                  <span
                    aria-hidden="true"
                    className="slop-cursor-blink inline-block font-bold text-[#22C55E] -ml-1"
                  >
                    _
                  </span>
                  <span
                    aria-hidden="true"
                    className="ml-3 pl-3 border-l border-white/15 text-[10px] uppercase tracking-widest text-[#F5F5F0]/65 group-hover:text-[#F5F5F0] transition-colors"
                  >
                    COPY
                  </span>
                </span>
              )}
            </button>
          </div>
        </div>

        {/* Minimal Scroll Cue Button */}
        <div className="pointer-events-auto">
          <button
            type="button"
            onClick={handleScrollToDropzone}
            aria-label="Scroll to audit manifest"
            className="slop-stepped-bounce group flex items-center gap-2 text-[11px] font-pixel uppercase tracking-[0.2em] text-[#F5F5F0]/45 hover:text-[#22C55E] transition-colors cursor-pointer py-1 px-3"
            style={{ clipPath: STEPPED_PILL_CLIP }}
          >
            <span>↓ SCROLL TO AUDIT</span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default HeroTerminalOverlay;
