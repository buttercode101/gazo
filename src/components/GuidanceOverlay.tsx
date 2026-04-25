import { useCallback, useEffect, useLayoutEffect, useMemo, useState } from 'react';
import { GuidanceStep } from '../lib/guidance';

interface GuidanceOverlayProps {
  open: boolean;
  step: GuidanceStep | null;
  stepIndex: number;
  totalSteps: number;
  onNext: () => void;
  onSkipAll: () => void;
}

interface TargetRect {
  top: number;
  left: number;
  width: number;
  height: number;
}

const CARD_WIDTH = 280;

export function GuidanceOverlay({ open, step, stepIndex, totalSteps, onNext, onSkipAll }: GuidanceOverlayProps) {
  const [targetRect, setTargetRect] = useState<TargetRect | null>(null);
  const resolveVisibleTarget = useCallback(() => {
    if (!step?.targetId) return null;
    const candidates = Array.from(document.querySelectorAll<HTMLElement>(`[data-guidance="${step.targetId}"]`));
    return (
      candidates.find((el) => {
        const style = window.getComputedStyle(el);
        const rect = el.getBoundingClientRect();
        return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
      }) || null
    );
  }, [step?.targetId]);

  useLayoutEffect(() => {
    if (!open || !step?.targetId) {
      setTargetRect(null);
      return;
    }

    const resolveTarget = () => {
      const visible = resolveVisibleTarget();
      if (!visible) {
        setTargetRect(null);
        return;
      }

      const rect = visible.getBoundingClientRect();
      setTargetRect({ top: rect.top, left: rect.left, width: rect.width, height: rect.height });
    };

    resolveTarget();
    window.addEventListener('resize', resolveTarget);
    window.addEventListener('scroll', resolveTarget, true);

    return () => {
      window.removeEventListener('resize', resolveTarget);
      window.removeEventListener('scroll', resolveTarget, true);
    };
  }, [open, step, resolveVisibleTarget]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onSkipAll();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onSkipAll]);

  useEffect(() => {
    if (!open || !step?.targetId) return;
    const target = document.getElementById(step.targetId);
    if (!target) return;
    target.scrollIntoView({ block: 'center', inline: 'center', behavior: 'smooth' });
  }, [open, step]);

  const cardStyle = useMemo(() => {
    if (!targetRect || !step) {
      return {
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
      };
    }

    const gap = 16;
    const viewportPadding = 12;
    let top = targetRect.top;
    let left = targetRect.left;
    let transform = 'none';

    switch (step.placement) {
      case 'top':
        top = targetRect.top - gap;
        left = targetRect.left + targetRect.width / 2;
        transform = 'translate(-50%, -100%)';
        break;
      case 'bottom':
        top = targetRect.top + targetRect.height + gap;
        left = targetRect.left + targetRect.width / 2;
        transform = 'translate(-50%, 0)';
        break;
      case 'left':
        top = targetRect.top + targetRect.height / 2;
        left = targetRect.left - gap;
        transform = 'translate(-100%, -50%)';
        break;
      case 'right':
        top = targetRect.top + targetRect.height / 2;
        left = targetRect.left + targetRect.width + gap;
        transform = 'translate(0, -50%)';
        break;
      default:
        top = targetRect.top + targetRect.height / 2;
        left = targetRect.left + targetRect.width / 2;
        transform = 'translate(-50%, -50%)';
        break;
    }

    top = Math.max(viewportPadding, Math.min(window.innerHeight - 140, top));
    left = Math.max(viewportPadding + CARD_WIDTH / 2, Math.min(window.innerWidth - viewportPadding - CARD_WIDTH / 2, left));

    return { top, left, transform };
  }, [targetRect, step]);

  if (!open || !step) return null;
  const tapHintTop = targetRect ? Math.max(8, targetRect.top - 28) : 8;

  return (
    <div className="fixed inset-0 z-[180] pointer-events-none" aria-live="polite">
      <div className="absolute inset-0 bg-black/50" />

      {targetRect && (
        <>
          <div
            className="absolute rounded-2xl border border-[#FF6200]/70 shadow-[0_0_0_9999px_rgba(0,0,0,0.55)]"
            style={{
              top: targetRect.top - 6,
              left: targetRect.left - 6,
              width: targetRect.width + 12,
              height: targetRect.height + 12,
            }}
          />
          <div
            className="absolute pointer-events-none rounded-full bg-[#FF6200] text-[10px] font-black px-2 py-1 animate-pulse shadow-lg shadow-[#FF6200]/35"
            style={{
              top: targetRect.top - 28,
              left: targetRect.left + targetRect.width / 2,
              transform: 'translateX(-50%)',
            }}
          >
            Tap here
          </div>
        </>
      )}

      <div
        role="dialog"
        aria-label="Guidance"
        className="absolute pointer-events-auto w-[280px] rounded-2xl border border-white/15 bg-[#101722]/96 p-4 shadow-2xl"
        style={cardStyle}
      >
        <div className="flex items-center justify-between gap-3">
          <p className="text-[10px] uppercase tracking-[0.2em] text-[#FF8A45] font-bold">{step.shortLabel}</p>
          <p className="text-[10px] text-white/50 font-bold">{Math.max(stepIndex + 1, 1)} / {Math.max(totalSteps, 1)}</p>
        </div>
        <div className="mt-2 h-1 rounded-full bg-white/10 overflow-hidden">
          <div
            className="h-full rounded-full bg-gradient-to-r from-[#FF8A45] to-[#FF6200]"
            style={{ width: `${((stepIndex + 1) / Math.max(totalSteps, 1)) * 100}%` }}
          />
        </div>
        <h3 className="text-sm font-black mt-1">{step.title}</h3>
        <p className="text-xs text-white/70 mt-1.5 leading-relaxed">{step.description}</p>
        {step.clickTargetLabel && (
          <p className="mt-2 text-[11px] text-[#FFB48A] font-bold">
            Next: tap <span className="text-white">{step.clickTargetLabel}</span> to unlock the next tip.
          </p>
        )}

        <div className="mt-4 flex items-center gap-2">
          <button
            onClick={onSkipAll}
            className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/15 text-[11px] font-bold"
          >
            Skip tips
          </button>
          <button
            onClick={onNext}
            className="ml-auto px-3 py-1.5 rounded-lg bg-[#FF6200] hover:bg-[#E65800] text-[11px] font-black"
          >
            {step.ctaLabel || "Got it"}
          </button>
        </div>
      </div>
    </div>
  );
}
