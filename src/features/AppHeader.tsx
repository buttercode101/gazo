import { CircleHelp, Download, Droplet, Smartphone, UserCircle, X } from "lucide-react";
import { User } from "firebase/auth";
import { toast } from "sonner";

type Props = {
  isOffline: boolean;
  pendingWrites: boolean;
  scopeLabel: string;
  activeFuelType: "diesel" | "petrol";
  setActiveFuelType: (fuel: "diesel" | "petrol") => void;
  tankSize: number;
  setTankSize: (size: number) => void;
  deferredPrompt: any;
  showIosInstallHint: boolean;
  onInstallClick: () => void;
  onDismissInstallPrompt: () => void;
  onDismissIosPrompt: () => void;
  onReopenGuidance: () => void;
  user: User | null | undefined;
  isProfileOpen: boolean;
  setIsProfileOpen: (open: boolean) => void;
  canSeedStations: boolean;
  onSeedStations: () => Promise<void>;
  onBlockedSeedAttempt: () => void;
  onLogOut: () => void;
  onSignIn: () => void;
};

export function AppHeader(props: Props) {
  const {
    isOffline,
    pendingWrites,
    scopeLabel,
    activeFuelType,
    setActiveFuelType,
    tankSize,
    setTankSize,
    deferredPrompt,
    showIosInstallHint,
    onInstallClick,
    onDismissInstallPrompt,
    onDismissIosPrompt,
    onReopenGuidance,
    user,
    isProfileOpen,
    setIsProfileOpen,
    canSeedStations,
    onSeedStations,
    onBlockedSeedAttempt,
    onLogOut,
    onSignIn,
  } = props;

  return (
    <header className={`absolute left-3 right-3 md:left-5 md:right-5 z-50 ${isOffline || pendingWrites ? "top-9" : "top-3"}`}>
      <div className="rounded-2xl border border-white/10 bg-[#0D1320]/92 backdrop-blur-xl px-3 md:px-4 py-2.5 shadow-[0_16px_36px_rgba(0,0,0,0.4)]">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#FF7B2F] to-[#FF6200] flex items-center justify-center shadow-lg shadow-[#FF6200]/30 shrink-0">
              <Droplet className="w-5 h-5" />
            </div>
            <div className="hidden sm:block min-w-0">
              <p className="font-black leading-tight">TankUp</p>
              <p className="text-[10px] uppercase tracking-[0.2em] text-white/50 font-bold truncate">{scopeLabel}</p>
            </div>
          </div>

          <div className="ml-auto flex items-center gap-2">
            <div className="hidden lg:flex items-center bg-white/5 rounded-xl p-1 border border-white/10">
              <button onClick={() => setActiveFuelType("diesel")} className={`px-3 py-1.5 rounded-lg text-xs font-black ${activeFuelType === "diesel" ? "bg-[#FF6200]" : "text-white/60"}`}>
                Diesel
              </button>
              <button onClick={() => setActiveFuelType("petrol")} className={`px-3 py-1.5 rounded-lg text-xs font-black ${activeFuelType === "petrol" ? "bg-blue-600" : "text-white/60"}`}>
                Petrol
              </button>
            </div>

            <div className="hidden lg:flex items-center gap-1.5 bg-white/5 border border-white/10 rounded-xl px-2 py-1.5">
              <span className="text-[10px] uppercase tracking-wider text-white/50 font-bold">Tank L</span>
              <input
                type="number"
                value={tankSize}
                onChange={(e) => setTankSize(Math.max(1, Number(e.target.value || 0)))}
                className="w-14 bg-transparent text-sm font-black text-center outline-none"
                aria-label="Tank size in liters"
              />
            </div>

            {(deferredPrompt || showIosInstallHint) && (
              <div className="flex items-center gap-1">
                {deferredPrompt ? (
                  <button onClick={onInstallClick} className="px-3 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-bold flex items-center gap-1.5">
                    <Download className="w-3.5 h-3.5" /> Install App
                  </button>
                ) : (
                  <button
                    onClick={() =>
                      toast.message("Install TankUp on iPhone", {
                        description: "Tap Share, then Add to Home Screen.",
                        duration: 6000,
                      })
                    }
                    className="px-3 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-bold flex items-center gap-1.5"
                  >
                    <Smartphone className="w-3.5 h-3.5" /> iPhone Install
                  </button>
                )}
                <button onClick={deferredPrompt ? onDismissInstallPrompt : onDismissIosPrompt} className="p-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10" aria-label="Dismiss install prompt">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            <button onClick={onReopenGuidance} className="p-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10" aria-label="Show quick tips">
              <CircleHelp className="w-4 h-4" />
            </button>

            {user && !user.isAnonymous ? (
              <div className="relative">
                <button onClick={() => setIsProfileOpen(!isProfileOpen)} className="p-1.5 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10">
                  <img src={user.photoURL || ""} alt={`${user.displayName || "User"} profile photo`} className="w-7 h-7 rounded-full" />
                </button>
                {isProfileOpen && (
                  <div className="absolute right-0 top-12 w-60 rounded-2xl border border-white/10 bg-[#121824]/95 backdrop-blur-2xl shadow-2xl p-4">
                    <p className="font-bold truncate">{user.displayName || "Driver"}</p>
                    <p className="text-[10px] uppercase tracking-widest text-white/45 mb-3 truncate">{user.email}</p>
                    {canSeedStations ? (
                      <button onClick={onSeedStations} className="w-full mb-2 py-2 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-xs font-bold">
                        Seed stations
                      </button>
                    ) : (
                      <button
                        onClick={onBlockedSeedAttempt}
                        className="w-full mb-2 py-2 rounded-xl bg-white/5 border border-white/10 text-white/55 text-xs font-bold"
                        aria-label="Seed stations is restricted to system operators"
                      >
                        Seed stations (ops only)
                      </button>
                    )}
                    <div className="grid grid-cols-2 gap-2">
                      <button onClick={() => setIsProfileOpen(false)} className="py-2 rounded-xl bg-white/5 text-xs font-bold hover:bg-white/10">Close</button>
                      <button onClick={onLogOut} className="py-2 rounded-xl bg-red-500/15 text-red-400 text-xs font-bold hover:bg-red-500/25">Sign out</button>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <button onClick={onSignIn} className="px-3 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-bold flex items-center gap-1.5">
                <UserCircle className="w-4 h-4" /> Sign in
              </button>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
