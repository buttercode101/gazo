import { Clock, RefreshCw, WifiOff, X } from "lucide-react";
import { useEffect, useState } from "react";

type Props = {
  isAppReady: boolean;
  locationDenied: boolean;
  isOffline: boolean;
  pendingWrites: boolean;
  bootProgress: number;
  bootPhaseLabel: string;
  showUpdatePrompt: boolean;
  setIsAppReady: (ready: boolean) => void;
  onApplyUpdate: () => Promise<void>;
  onDismissUpdate: () => void;
};

export function OnboardingController({
  isAppReady,
  locationDenied,
  isOffline,
  pendingWrites,
  bootProgress,
  bootPhaseLabel,
  showUpdatePrompt,
  setIsAppReady,
  onApplyUpdate,
  onDismissUpdate,
}: Props) {
  const [showLoader, setShowLoader] = useState(!isAppReady);
  const [loaderExiting, setLoaderExiting] = useState(false);

  useEffect(() => {
    if (!isAppReady) {
      setShowLoader(true);
      setLoaderExiting(false);
      return;
    }
    setLoaderExiting(true);
    const timeout = window.setTimeout(() => setShowLoader(false), 520);
    return () => window.clearTimeout(timeout);
  }, [isAppReady]);

  return (
    <>
      {showLoader && (
        <div className={`absolute inset-0 z-[120] pointer-events-none bootloader-grid flex flex-col items-center justify-center overflow-hidden transition-all duration-500 ${loaderExiting ? "opacity-0 blur-sm scale-[1.015]" : "opacity-100 blur-0 scale-100"}`}>
          <div className="absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-transparent to-[#0B0F18]/35" />
          <div className="absolute inset-x-0 bottom-0 h-56 bg-gradient-to-t from-[#0B0F18]/90 via-[#0B0F18]/70 to-transparent" />
          <div className="relative mb-6 transition-all duration-500">
            <div className="absolute inset-0 rounded-full bg-[#FF6200]/20 blur-xl animate-pulse" />
            <div className="relative h-20 w-20 rounded-full border border-white/10 bg-white/5 backdrop-blur-xl flex items-center justify-center">
              <div className="h-12 w-12 rounded-full border-2 border-transparent border-t-[#FF6200] border-r-[#FF6200] animate-spin" />
            </div>
          </div>
          <h2 className="text-4xl font-black tracking-tight">TankUp</h2>
          <p className="text-xs uppercase tracking-[0.32em] text-white/45 mt-2">Preparing live fuel intelligence</p>
          <div className="mt-6 w-[min(70vw,320px)] space-y-2.5">
            <div className="h-2 rounded-full bg-white/10 overflow-hidden">
              <div
                className="h-full bootloader-shimmer transition-[width] duration-500 ease-out"
                style={{ width: `${Math.max(18, Math.min(100, bootProgress))}%` }}
              />
            </div>
            <div className="flex items-center justify-between text-[11px] text-white/45 font-semibold uppercase tracking-widest">
              <span>{bootPhaseLabel}</span>
              <span className="bootloader-dots">...</span>
            </div>
          </div>
          {locationDenied && (
            <button onClick={() => setIsAppReady(true)} className="mt-8 px-4 py-2 rounded-xl bg-white/10 text-sm font-bold pointer-events-auto">
              Continue without location
            </button>
          )}
        </div>
      )}

      {(isOffline || pendingWrites) && (
        <div className={`absolute top-0 left-0 right-0 h-7 z-[90] text-[11px] font-bold uppercase tracking-wider flex items-center justify-center gap-2 ${isOffline ? "bg-[#FF6200]" : "bg-blue-600"}`}>
          {isOffline ? <WifiOff className="w-3.5 h-3.5" /> : <Clock className="w-3.5 h-3.5 animate-spin" />}
          {isOffline ? `Offline · ${pendingWrites ? "Sync queued" : "Browsing cached data"}` : "Syncing changes"}
        </div>
      )}

      {showUpdatePrompt && (
        <div className={`absolute left-3 right-3 md:left-5 md:right-5 z-[95] ${(isOffline || pendingWrites) ? "top-10" : "top-4"}`}>
          <div className="rounded-2xl border border-emerald-400/30 bg-emerald-500/15 backdrop-blur-xl px-4 py-3 flex items-center gap-3 shadow-[0_12px_30px_rgba(0,0,0,0.35)]">
            <RefreshCw className="w-4 h-4 text-emerald-300 shrink-0" />
            <p className="text-xs md:text-sm font-semibold text-emerald-100">A new TankUp update is ready.</p>
            <div className="ml-auto flex items-center gap-2">
              <button onClick={onApplyUpdate} className="px-3 py-1.5 rounded-lg bg-emerald-400/30 hover:bg-emerald-400/40 text-xs font-black">
                Refresh now
              </button>
              <button onClick={onDismissUpdate} className="p-1.5 rounded-lg hover:bg-white/10" aria-label="Dismiss update notice">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
