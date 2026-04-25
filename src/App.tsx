import { useState, useMemo, useEffect, useCallback } from "react";
import { useStations } from "./hooks/useStations";
import { Station } from "./types";
import { MapView } from "./components/Map";
import { ReportModal } from "./components/ReportModal";
import { calculateDistance } from "./lib/utils";
import {
  Droplet,
  Download,
  Smartphone,
  UserCircle,
  WifiOff,
  Share2,
  LocateFixed,
  Clock,
  Navigation,
  TrendingUp,
  MapPin,
  CheckCircle2,
  ShieldAlert,
  SlidersHorizontal,
  Star,
  ChevronUp,
  CircleHelp,
  RefreshCw,
  X,
} from "lucide-react";
import { Toaster, toast } from "sonner";
import { auth, signInWithGoogle, logOut } from "./lib/firebase";
import { useAuthState } from "react-firebase-hooks/auth";
import { triggerHaptic, triggerShare, seedDatabase } from "./lib/seedData";
import { StationDetailsModal } from "./components/StationDetailsModal";
import { getFillRecommendation, getStationTrust } from "./lib/trust";
import { GuidanceOverlay } from "./components/GuidanceOverlay";
import { GUIDANCE_STEPS, GUIDANCE_STORAGE_KEY, defaultGuidanceState, GuidanceAction, GuidanceState } from "./lib/guidance";

const BRANDS = ["All", "Engen", "Sasol", "Shell", "BP", "Astron Energy", "TotalEnergies"];

type MobileSheetSize = "peek" | "mid" | "full";

export default function App() {
  const [userLocation, setUserLocation] = useState<[number, number] | null>(null);
  const [tankSize, setTankSize] = useState<number>(70);
  const [browseScope, setBrowseScope] = useState<"nearby" | "south_africa">("nearby");
  const { stations, communityStats, reportPrice, pendingWrites, loading: dataLoading } = useStations(
    userLocation,
    tankSize,
    browseScope
  );

  const [activeFuelType, setActiveFuelType] = useState<"diesel" | "petrol">("diesel");
  const [brandFilter, setBrandFilter] = useState<string>("All");
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [verifiedOnly, setVerifiedOnly] = useState(false);
  const [freshOnly, setFreshOnly] = useState(false);
  const [favorites, setFavorites] = useState<string[]>([]);

  const [isReportModalOpen, setIsReportModalOpen] = useState(false);
  const [detailsStation, setDetailsStation] = useState<Station | null>(null);
  const [selectedStation, setSelectedStation] = useState<Station | null>(null);
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [showIosInstallHint, setShowIosInstallHint] = useState(false);
  const [showUpdatePrompt, setShowUpdatePrompt] = useState(false);
  const [user] = useAuthState(auth);
  const [visits, setVisits] = useState(0);
  const [sortBy, setSortBy] = useState<"distance" | "price">("distance");
  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [recentReportId, setRecentReportId] = useState<string | null>(null);
  const [isAppReady, setIsAppReady] = useState(false);
  const [mapReady, setMapReady] = useState(false);
  const [locationDenied, setLocationDenied] = useState(false);
  const [mobileSheetSize, setMobileSheetSize] = useState<MobileSheetSize>("mid");
  const [showMobileFilters, setShowMobileFilters] = useState(false);
  const [guidance, setGuidance] = useState<GuidanceState>(defaultGuidanceState);
  const [isGuidanceOpen, setIsGuidanceOpen] = useState(false);

  const isInSouthAfrica = (lat: number, lng: number) => lat >= -35.5 && lat <= -21.5 && lng >= 16 && lng <= 33.5;

  const markGuidanceAction = useCallback((action: GuidanceAction) => {
    setGuidance((prev) => {
      if (prev.actions[action]) return prev;
      return { ...prev, actions: { ...prev.actions, [action]: true } };
    });
  }, []);

  useEffect(() => {
    if (!dataLoading) {
      if (mapReady) {
        setIsAppReady(true);
      } else {
        const timeout = setTimeout(() => setIsAppReady(true), 3000);
        return () => clearTimeout(timeout);
      }
    }
  }, [dataLoading, mapReady]);

  useEffect(() => {
    const saved = localStorage.getItem("tankup_favorites");
    if (saved) {
      try {
        setFavorites(JSON.parse(saved));
      } catch (e) {
        console.error("Failed to parse favorites", e);
      }
    }
  }, []);

  useEffect(() => {
    const saved = localStorage.getItem(GUIDANCE_STORAGE_KEY);
    if (!saved) return;
    try {
      const parsed = JSON.parse(saved) as GuidanceState;
      setGuidance({
        dismissed: Boolean(parsed.dismissed),
        completedSteps: Array.isArray(parsed.completedSteps) ? parsed.completedSteps : [],
        actions: parsed.actions || {},
        lastShownAt: parsed.lastShownAt,
      });
    } catch (error) {
      console.error("Failed to parse guidance state", error);
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(GUIDANCE_STORAGE_KEY, JSON.stringify(guidance));
  }, [guidance]);

  const toggleFavorite = (stationId?: string) => {
    if (!stationId) return;
    triggerHaptic();
    setFavorites((prev) => {
      const next = prev.includes(stationId) ? prev.filter((id) => id !== stationId) : [...prev, stationId];
      localStorage.setItem("tankup_favorites", JSON.stringify(next));
      if (!prev.includes(stationId)) toast.success("Added to favorites");
      return next;
    });
  };

  useEffect(() => {
    const v = Number(localStorage.getItem("tankup_visits") || 0);
    setVisits(v);
    localStorage.setItem("tankup_visits", (v + 1).toString());

    const handleInstallPrompt = (e: any) => {
      e.preventDefault();
      const dismissed = localStorage.getItem("tankup_install_prompt_dismissed") === "1";
      if (v >= 1 && !dismissed) setDeferredPrompt(e);
    };
    const handleInstalled = () => {
      setDeferredPrompt(null);
      setShowIosInstallHint(false);
      localStorage.setItem("tankup_install_prompt_dismissed", "1");
      toast.success("TankUp installed");
    };
    const handlePwaUpdateReady = () => setShowUpdatePrompt(true);
    const handlePwaOfflineReady = () => toast.success("Offline mode ready");

    window.addEventListener("beforeinstallprompt", handleInstallPrompt);
    window.addEventListener("appinstalled", handleInstalled);
    window.addEventListener("tankup:pwa-update-ready", handlePwaUpdateReady as EventListener);
    window.addEventListener("tankup:pwa-offline-ready", handlePwaOfflineReady as EventListener);

    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("beforeinstallprompt", handleInstallPrompt);
      window.removeEventListener("appinstalled", handleInstalled);
      window.removeEventListener("tankup:pwa-update-ready", handlePwaUpdateReady as EventListener);
      window.removeEventListener("tankup:pwa-offline-ready", handlePwaOfflineReady as EventListener);
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  useEffect(() => {
    const isStandalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
    const ua = navigator.userAgent.toLowerCase();
    const isIos = /iphone|ipad|ipod/.test(ua);
    const isSafari = /safari/.test(ua) && !/chrome|crios|fxios/.test(ua);
    const dismissed = localStorage.getItem("tankup_ios_install_hint_dismissed") === "1";

    setShowIosInstallHint(isIos && isSafari && !isStandalone && !dismissed);
  }, []);

  const locateUser = () => {
    if (!navigator.geolocation) {
      setLocationDenied(true);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const next: [number, number] = [pos.coords.latitude, pos.coords.longitude];
        setUserLocation(next);
        if (!isInSouthAfrica(next[0], next[1])) {
          setBrowseScope("south_africa");
          toast.info("You appear outside South Africa. Switched to national South Africa view.");
        }
        setLocationDenied(false);
      },
      (err) => {
        console.error("Location error", err);
        setLocationDenied(true);
      },
      { enableHighAccuracy: true }
    );
  };

  useEffect(() => {
    locateUser();
  }, []);

  const avgPrice = useMemo(() => {
    const prices = stations
      .map((s) => (activeFuelType === "diesel" ? s.diesel_price : s.petrol_price))
      .filter((p): p is number => p !== null && p > 0);

    if (prices.length === 0) return 0;
    return prices.reduce((a, b) => a + b, 0) / prices.length;
  }, [stations, activeFuelType]);

  const sortedStations = useMemo(() => {
    const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
    let stats = [...stations];

    if (favoritesOnly) stats = stats.filter((s) => s.id && favorites.includes(s.id));
    if (verifiedOnly) stats = stats.filter((s) => Boolean(s.latest_image_url));
    if (freshOnly) stats = stats.filter((s) => Date.now() - s.last_updated < sevenDaysMs);
    if (brandFilter !== "All") stats = stats.filter((s) => s.name.toLowerCase().includes(brandFilter.toLowerCase()));

    if (browseScope === "nearby" && userLocation) {
      stats = stats.map((s) => ({
        ...s,
        distance: calculateDistance(userLocation[0], userLocation[1], s.lat, s.lng),
      }));
    }

    return stats.sort((a, b) => {
      if (sortBy === "distance") {
        if (browseScope !== "nearby") return 0;
        return (a.distance || 0) - (b.distance || 0);
      }

      const priceA = activeFuelType === "diesel" ? a.diesel_price : a.petrol_price;
      const priceB = activeFuelType === "diesel" ? b.diesel_price : b.petrol_price;
      if (!priceA && !priceB) return 0;
      if (!priceA) return 1;
      if (!priceB) return -1;
      return priceA - priceB;
    });
  }, [stations, favoritesOnly, favorites, verifiedOnly, freshOnly, brandFilter, browseScope, userLocation, sortBy, activeFuelType]);

  const bestNowStations = useMemo(() => sortedStations.slice(0, 3), [sortedStations]);
  const listStations = useMemo(() => sortedStations.slice(bestNowStations.length), [sortedStations, bestNowStations.length]);
  const recommendationTarget = selectedStation || sortedStations[0] || null;
  const recommendationPrice = recommendationTarget
    ? activeFuelType === "diesel"
      ? recommendationTarget.diesel_price
      : recommendationTarget.petrol_price
    : null;
  const fillRecommendation = useMemo(
    () => getFillRecommendation(recommendationTarget, avgPrice, recommendationPrice, tankSize),
    [recommendationTarget, avgPrice, recommendationPrice, tankSize]
  );

  const handleMapMarkerClick = (station: Station) => {
    markGuidanceAction("station_selected");
    setRecentReportId(station.id || null);
    setTimeout(() => setRecentReportId(null), 1000);

    const el = document.getElementById(`station-card-${station.id}`);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "nearest" });

    setSelectedStation(station);
  };

  const handleOpenReport = (station?: Station | { lat: number; lng: number }) => {
    markGuidanceAction("report_opened");
    triggerHaptic();
    let targetStation: any = station || null;

    if (!targetStation && sortedStations.length > 0 && sortedStations[0].distance !== undefined && sortedStations[0].distance <= 0.2) {
      targetStation = sortedStations[0];
      toast.info(`Auto-selected: ${targetStation.name}`);
    } else if (targetStation && !("name" in targetStation)) {
      targetStation = { lat: targetStation.lat, lng: targetStation.lng, name: "", address: "" };
    }

    setSelectedStation(targetStation);
    setIsReportModalOpen(true);
  };

  const handleReportTask = async (
    stationData: Partial<Station> | null,
    fuelTypes: ("diesel" | "petrol")[],
    prices: { diesel?: number; petrol?: number },
    file?: File | null
  ) => {
    try {
      const id = await reportPrice(selectedStation?.id, stationData, fuelTypes, prices, file);
      if (id) {
        markGuidanceAction("report_submitted");
        setRecentReportId(id);
        setTimeout(() => setRecentReportId(null), 4000);
      }
    } catch (error) {
      console.error("Report submission failed:", error);
      throw error;
    }
  };

  const handleInstallClick = () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    deferredPrompt.userChoice.then((choice: { outcome?: string }) => {
      if (choice?.outcome === "accepted") {
        localStorage.setItem("tankup_install_prompt_dismissed", "1");
      }
      setDeferredPrompt(null);
    });
  };

  const handleDismissInstallPrompt = () => {
    setDeferredPrompt(null);
    localStorage.setItem("tankup_install_prompt_dismissed", "1");
  };

  const handleDismissIosPrompt = () => {
    setShowIosInstallHint(false);
    localStorage.setItem("tankup_ios_install_hint_dismissed", "1");
  };

  const handleApplyUpdate = async () => {
    try {
      await window.__tankupTriggerSwUpdate?.(true);
    } catch (error) {
      console.error("Failed to update service worker", error);
      toast.error("Update failed. Please refresh.");
    }
  };

  const handleOpenDetails = (station: Station) => {
    markGuidanceAction("details_opened");
    setDetailsStation(station);
  };

  const handleSelectStation = (station: Station) => {
    markGuidanceAction("station_selected");
    setSelectedStation(station);
  };

  const formatRelativeTime = (timestamp: number) => {
    const diffMins = Math.max(1, Math.floor((Date.now() - timestamp) / 60000));
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    return `${Math.floor(diffHours / 24)}d ago`;
  };

  const sheetHeightClass =
    mobileSheetSize === "peek" ? "h-[26dvh]" : mobileSheetSize === "mid" ? "h-[56dvh]" : "h-[92dvh]";
  const mobileSheetHeight = mobileSheetSize === "peek" ? "26dvh" : mobileSheetSize === "mid" ? "56dvh" : "92dvh";

  const scopeLabel = browseScope === "nearby" ? "Nearby 100km" : "South Africa";
  const currentGuidanceStep = useMemo(() => {
    if (guidance.dismissed || visits > 3) return null;
    return GUIDANCE_STEPS.find((step) => {
      const triggerReady = Boolean(guidance.actions[step.triggerAction]);
      const alreadyDone = guidance.completedSteps.includes(step.id);
      return triggerReady && !alreadyDone;
    }) || null;
  }, [guidance, visits]);
  const currentGuidanceStepIndex = useMemo(
    () => (currentGuidanceStep ? GUIDANCE_STEPS.findIndex((step) => step.id === currentGuidanceStep.id) : -1),
    [currentGuidanceStep]
  );

  useEffect(() => {
    if (!currentGuidanceStep) {
      setIsGuidanceOpen(false);
      return;
    }

    const now = Date.now();
    const cooldownMs = 5000;
    if (guidance.lastShownAt && now - guidance.lastShownAt < cooldownMs) return;

    setIsGuidanceOpen(true);
    setGuidance((prev) => ({ ...prev, lastShownAt: now }));
  }, [currentGuidanceStep, guidance.lastShownAt]);

  useEffect(() => {
    if (!currentGuidanceStep?.completeOnAction) return;
    if (!guidance.actions[currentGuidanceStep.completeOnAction]) return;

    setGuidance((prev) => {
      if (prev.completedSteps.includes(currentGuidanceStep.id)) return prev;
      return { ...prev, completedSteps: [...prev.completedSteps, currentGuidanceStep.id] };
    });
    setIsGuidanceOpen(false);
  }, [currentGuidanceStep, guidance.actions]);

  const handleGuidanceNext = () => {
    if (!currentGuidanceStep) {
      setIsGuidanceOpen(false);
      return;
    }
    if (currentGuidanceStep.completeOnAction) {
      setIsGuidanceOpen(false);
      return;
    }
    setGuidance((prev) => {
      if (prev.completedSteps.includes(currentGuidanceStep.id)) return prev;
      return { ...prev, completedSteps: [...prev.completedSteps, currentGuidanceStep.id] };
    });
    setIsGuidanceOpen(false);
  };

  const handleDismissGuidance = () => {
    setGuidance((prev) => ({ ...prev, dismissed: true }));
    setIsGuidanceOpen(false);
  };

  const handleReopenGuidance = () => {
    setGuidance((prev) => ({
      ...prev,
      dismissed: false,
      completedSteps: [],
      lastShownAt: undefined,
    }));
    setIsGuidanceOpen(true);
  };

  return (
    <div className="relative h-dvh w-full overflow-hidden bg-[#070B12] text-white font-sans">
      <Toaster theme="dark" position="top-center" />

      {!isAppReady && (
        <div className="absolute inset-0 z-[200] bg-[#0B0F18] flex flex-col items-center justify-center">
          <div className="h-16 w-16 rounded-full border-2 border-transparent border-t-[#FF6200] border-r-[#FF6200] animate-spin mb-5" />
          <h2 className="text-3xl font-black">TankUp</h2>
          <p className="text-xs uppercase tracking-[0.3em] text-white/40 mt-2">Starting live dashboard</p>
          {locationDenied && (
            <button onClick={() => setIsAppReady(true)} className="mt-8 px-4 py-2 rounded-xl bg-white/10 hover:bg-white/15 text-sm font-bold">
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
              <button onClick={handleApplyUpdate} className="px-3 py-1.5 rounded-lg bg-emerald-400/30 hover:bg-emerald-400/40 text-xs font-black">
                Refresh now
              </button>
              <button onClick={() => setShowUpdatePrompt(false)} className="p-1.5 rounded-lg hover:bg-white/10" aria-label="Dismiss update notice">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      )}

      <div data-guidance="guidance-map" className="absolute inset-0">
        <MapView
          stations={sortedStations}
          userLocation={browseScope === "nearby" ? userLocation : null}
          activeFuelType={activeFuelType}
          onMapReady={() => {
            setMapReady(true);
            markGuidanceAction("map_ready");
          }}
          onReportClick={(st) => handleOpenReport(st)}
          onStationSelect={handleMapMarkerClick}
          onLocationReport={(latLng) => handleOpenReport({ lat: latLng[0], lng: latLng[1] })}
          recentReportId={recentReportId}
        />
      </div>

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
                <button
                  onClick={() => setActiveFuelType("diesel")}
                  className={`px-3 py-1.5 rounded-lg text-xs font-black ${activeFuelType === "diesel" ? "bg-[#FF6200]" : "text-white/60"}`}
                >
                  Diesel
                </button>
                <button
                  onClick={() => setActiveFuelType("petrol")}
                  className={`px-3 py-1.5 rounded-lg text-xs font-black ${activeFuelType === "petrol" ? "bg-blue-600" : "text-white/60"}`}
                >
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
                    <button onClick={handleInstallClick} className="px-3 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-bold flex items-center gap-1.5">
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
                  <button
                    onClick={deferredPrompt ? handleDismissInstallPrompt : handleDismissIosPrompt}
                    className="p-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10"
                    aria-label="Dismiss install prompt"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}

              <button
                onClick={handleReopenGuidance}
                className="p-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10"
                aria-label="Show quick tips"
              >
                <CircleHelp className="w-4 h-4" />
              </button>

              {user && !user.isAnonymous ? (
                <div className="relative">
                  <button onClick={() => setIsProfileOpen((v) => !v)} className="p-1.5 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10">
                    <img src={user.photoURL || ""} alt={`${user.displayName || "User"} profile photo`} className="w-7 h-7 rounded-full" />
                  </button>
                  {isProfileOpen && (
                    <div className="absolute right-0 top-12 w-60 rounded-2xl border border-white/10 bg-[#121824]/95 backdrop-blur-2xl shadow-2xl p-4">
                      <p className="font-bold truncate">{user.displayName || "Driver"}</p>
                      <p className="text-[10px] uppercase tracking-widest text-white/45 mb-3 truncate">{user.email}</p>
                      {stations.length === 0 && (
                        <button
                          onClick={async () => {
                            const seeded = await seedDatabase();
                            if (seeded) {
                              toast.success("South African database initialized");
                              setIsProfileOpen(false);
                            }
                          }}
                          className="w-full mb-2 py-2 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-xs font-bold"
                        >
                          Seed stations
                        </button>
                      )}
                      <div className="grid grid-cols-2 gap-2">
                        <button onClick={() => setIsProfileOpen(false)} className="py-2 rounded-xl bg-white/5 text-xs font-bold hover:bg-white/10">Close</button>
                        <button onClick={() => { logOut(); setIsProfileOpen(false); }} className="py-2 rounded-xl bg-red-500/15 text-red-400 text-xs font-bold hover:bg-red-500/25">Sign out</button>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <button onClick={signInWithGoogle} className="px-3 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-bold flex items-center gap-1.5">
                  <UserCircle className="w-4 h-4" /> Sign in
                </button>
              )}
            </div>
          </div>
        </div>
      </header>

      <div className="hidden lg:block absolute top-24 left-5 bottom-5 w-[min(32vw,460px)] z-40">
        <section className="h-full rounded-[28px] border border-white/10 bg-[#0D1421]/94 backdrop-blur-2xl shadow-[0_22px_52px_rgba(0,0,0,0.45)] flex flex-col overflow-hidden">
          <div className="px-5 pt-5 pb-4 border-b border-white/10">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[10px] uppercase tracking-[0.22em] text-white/45 font-bold">Best right now</p>
                <h2 className="text-lg font-black mt-1">Live fuel board</h2>
              </div>
              <button data-guidance="guidance-report" onClick={() => handleOpenReport()} className="px-3 py-2 rounded-xl bg-[#FF6200] hover:bg-[#E65800] text-xs font-black">
                Report Price
              </button>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-2">
              <button
                onClick={() => setBrowseScope("nearby")}
                className={`px-3 py-2 rounded-xl text-xs font-bold ${browseScope === "nearby" ? "bg-emerald-500 text-[#052214]" : "bg-white/5 text-white/65 hover:text-white"}`}
              >
                Nearby
              </button>
              <button
                onClick={() => setBrowseScope("south_africa")}
                className={`px-3 py-2 rounded-xl text-xs font-bold ${browseScope === "south_africa" ? "bg-emerald-500 text-[#052214]" : "bg-white/5 text-white/65 hover:text-white"}`}
              >
                South Africa
              </button>
            </div>

            <div data-guidance="guidance-filters" className="mt-3 flex flex-wrap gap-2">
              <button onClick={() => { markGuidanceAction("filters_opened"); setFavoritesOnly((v) => !v); }} className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold ${favoritesOnly ? "bg-yellow-500 text-black" : "bg-white/5 text-white/70"}`}>Favorites</button>
              <button onClick={() => { markGuidanceAction("filters_opened"); setVerifiedOnly((v) => !v); }} className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold ${verifiedOnly ? "bg-blue-500 text-white" : "bg-white/5 text-white/70"}`}>Verified</button>
              <button onClick={() => { markGuidanceAction("filters_opened"); setFreshOnly((v) => !v); }} className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold ${freshOnly ? "bg-emerald-500 text-[#042312]" : "bg-white/5 text-white/70"}`}>Fresh</button>
              <button onClick={() => { markGuidanceAction("filters_opened"); setSortBy(sortBy === "distance" ? "price" : "distance"); }} className="px-2.5 py-1.5 rounded-lg text-[11px] font-bold bg-white/5 text-white/70">
                {sortBy === "distance" ? "Nearest" : "Cheapest"}
              </button>
            </div>

            <div className="mt-3 flex gap-2 overflow-x-auto hide-scrollbar">
              {BRANDS.map((brand) => (
                <button
                  key={brand}
                  onClick={() => setBrandFilter(brand)}
                  className={`px-3 py-1.5 rounded-lg whitespace-nowrap text-[11px] font-bold ${brandFilter === brand ? "bg-[#FF6200] text-white" : "bg-white/5 text-white/65"}`}
                >
                  {brand}
                </button>
              ))}
            </div>

            <div className="mt-3 rounded-xl border border-white/10 bg-white/5 px-3 py-2.5">
              <p className="text-[10px] uppercase tracking-[0.18em] text-white/45 font-bold">Smart fill decision</p>
              <p className="text-sm font-black mt-1">{fillRecommendation.title}</p>
              <p className="text-[11px] text-white/60 mt-1">{fillRecommendation.detail}</p>
            </div>
          </div>

          <div className="px-4 pt-3 pb-2 space-y-2 border-b border-white/10">
            {bestNowStations.map((station) => {
              const price = activeFuelType === "diesel" ? station.diesel_price : station.petrol_price;
              const isStale = Date.now() - station.last_updated > 7 * 24 * 60 * 60 * 1000;
              const trust = getStationTrust(station);
              return (
                <button
                  key={`best-${station.id}`}
                  onClick={() => handleSelectStation(station)}
                  className="w-full rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 px-3 py-2.5 text-left"
                >
                  <div className="flex justify-between gap-3 items-start">
                    <div className="min-w-0">
                      <p className="font-bold truncate">{station.name}</p>
                      <p className="text-[11px] text-white/55 mt-0.5 flex items-center gap-2">
                        {station.distance !== undefined ? `${station.distance.toFixed(1)} km` : "National"}
                        <span>·</span>
                        <span>{formatRelativeTime(station.last_updated)}</span>
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className={`text-base font-black ${activeFuelType === "diesel" ? "text-[#FF6200]" : "text-blue-500"}`}>{price ? `R ${price.toFixed(2)}` : "--"}</p>
                      <p className={`text-[10px] uppercase font-bold ${isStale ? "text-amber-500" : "text-emerald-400"}`}>{isStale ? "Stale" : "Fresh"}</p>
                      <p className={`text-[10px] font-bold mt-1 ${trust.tier === "high" ? "text-emerald-400" : trust.tier === "medium" ? "text-amber-400" : "text-red-400"}`}>
                        Trust {trust.score}
                      </p>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          <div className="flex-1 overflow-y-auto px-4 pt-3 pb-4 space-y-2 hide-scrollbar">
            {listStations.map((station) => {
              const price = activeFuelType === "diesel" ? station.diesel_price : station.petrol_price;
              const savings = price && avgPrice > 0 ? (avgPrice - price) * tankSize : 0;
              const isSelected = station.id && selectedStation?.id === station.id;
              const isFav = station.id && favorites.includes(station.id);
              const isStale = Date.now() - station.last_updated > 7 * 24 * 60 * 60 * 1000;
              const trust = getStationTrust(station);

              return (
                <div
                  id={`station-card-${station.id}`}
                  key={station.id}
                  className={`rounded-2xl border px-3.5 py-3 transition-all ${
                    isSelected ? "bg-emerald-500/12 border-emerald-400/50" : "bg-white/5 border-white/10 hover:bg-white/10"
                  } ${isStale ? "opacity-70" : "opacity-100"}`}
                >
                  <div className="flex justify-between gap-3">
                    <button onClick={() => handleSelectStation(station)} className="text-left flex-1 min-w-0">
                      <p className="font-bold truncate">{station.name}</p>
                      <p className="text-[11px] text-white/50 mt-1 truncate">{station.address}</p>
                      <p className="text-[11px] text-white/40 mt-1.5 flex items-center gap-2">
                        <span>{station.distance !== undefined ? `${station.distance.toFixed(1)} km` : "National"}</span>
                        <span>·</span>
                        <span>{formatRelativeTime(station.last_updated)}</span>
                        <span>·</span>
                        <span className={trust.tier === "high" ? "text-emerald-400" : trust.tier === "medium" ? "text-amber-400" : "text-red-400"}>
                          Trust {trust.score}
                        </span>
                        {station.latest_image_url && (
                          <>
                            <span>·</span>
                            <span className="text-blue-400">Verified</span>
                          </>
                        )}
                      </p>
                    </button>
                    <div className="shrink-0 text-right">
                      <p className={`text-lg font-black ${activeFuelType === "diesel" ? "text-[#FF6200]" : "text-blue-500"}`}>
                        {price ? `R ${price.toFixed(2)}` : "--"}
                      </p>
                      {price && avgPrice > 0 && (
                        <p className={`text-[10px] font-bold uppercase ${savings > 0 ? "text-emerald-400" : "text-white/35"}`}>
                          {savings > 0 ? `Save R${savings.toFixed(0)}` : "Avg/above"}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="mt-2.5 flex flex-wrap gap-1.5">
                    <a
                      href={`https://www.google.com/maps/dir/?api=1&destination=${station.lat},${station.lng}`}
                      target="_blank"
                      rel="noreferrer"
                      className="px-2 py-1 rounded-md bg-blue-500/15 text-blue-400 text-[10px] font-bold uppercase tracking-wider flex items-center gap-1"
                    >
                      <Navigation className="w-3 h-3" /> Go
                    </a>
                    <button onClick={() => handleOpenReport(station)} className="px-2 py-1 rounded-md bg-[#FF6200]/20 text-[#FF8A45] text-[10px] font-bold uppercase tracking-wider">Report</button>
                    <button onClick={() => toggleFavorite(station.id)} className={`px-2 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider ${isFav ? "bg-yellow-500/20 text-yellow-400" : "bg-white/10 text-white/65"}`}>
                      <Star className="w-3 h-3" />
                    </button>
                    <button data-guidance="guidance-trend" onClick={() => handleOpenDetails(station)} className="px-2 py-1 rounded-md bg-white/10 text-white/65 text-[10px] font-bold uppercase tracking-wider flex items-center gap-1">
                      <TrendingUp className="w-3 h-3" /> Trend
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="px-4 py-3 border-t border-white/10 bg-white/5 flex items-center justify-between text-[11px]">
            <span className="text-white/55">{listStations.length + bestNowStations.length} visible stations</span>
            <span className="text-white/45">R {communityStats.savedRand.toLocaleString()} saved today</span>
          </div>
        </section>
      </div>

      <button
        onClick={() => handleOpenReport()}
        data-guidance="guidance-report"
        className="lg:hidden absolute right-4 z-[60] w-14 h-14 rounded-2xl bg-[#FF6200] hover:bg-[#E65800] text-white shadow-[0_18px_36px_rgba(255,98,0,0.45)] flex items-center justify-center transition-[bottom] duration-300"
        style={{ bottom: `calc(${mobileSheetHeight} + env(safe-area-inset-bottom, 0px) + 0.75rem)` }}
        aria-label="Report price"
      >
        <MapPin className="w-6 h-6" />
      </button>

      <section className={`lg:hidden absolute left-0 right-0 bottom-0 z-50 ${sheetHeightClass} rounded-t-[30px] border-t border-white/10 bg-[#0D1421]/96 backdrop-blur-3xl shadow-[0_-24px_50px_rgba(0,0,0,0.45)] transition-all duration-300 flex flex-col`}>
        <button
          onClick={() => handleOpenReport()}
          data-guidance="guidance-report"
          className="absolute right-4 top-0 z-[70] -translate-y-[calc(100%+0.75rem)] w-14 h-14 rounded-2xl bg-[#FF6200] hover:bg-[#E65800] text-white shadow-[0_18px_36px_rgba(255,98,0,0.45)] flex items-center justify-center"
          aria-label="Report price"
        >
          <MapPin className="w-6 h-6" />
        </button>

        <div className="px-4 pt-3 pb-2 border-b border-white/10">
          <div className="flex items-center justify-between gap-2">
            <button onClick={() => setMobileSheetSize(mobileSheetSize === "full" ? "mid" : "full")} className="mx-auto block w-12 h-1.5 rounded-full bg-white/20" aria-label="Resize panel" />
          </div>

          <div className="mt-3 flex items-center gap-2">
            <button
              onClick={() => setActiveFuelType(activeFuelType === "diesel" ? "petrol" : "diesel")}
              className={`px-3 py-2 rounded-xl text-xs font-black ${activeFuelType === "diesel" ? "bg-[#FF6200]" : "bg-blue-600"}`}
            >
              {activeFuelType === "diesel" ? "Diesel" : "Petrol"}
            </button>
            <button onClick={() => setBrowseScope(browseScope === "nearby" ? "south_africa" : "nearby")} className="px-3 py-2 rounded-xl text-xs font-bold bg-white/10">
              {browseScope === "nearby" ? "Nearby" : "South Africa"}
            </button>
            <button data-guidance="guidance-filters" onClick={() => { markGuidanceAction("filters_opened"); setShowMobileFilters((v) => !v); }} className="ml-auto px-3 py-2 rounded-xl text-xs font-bold bg-white/10 flex items-center gap-1">
              <SlidersHorizontal className="w-3.5 h-3.5" /> Filters
            </button>
          </div>

          {showMobileFilters && (
            <div className="mt-2 space-y-2">
              <div className="flex gap-2 flex-wrap">
                <button onClick={() => setFavoritesOnly((v) => !v)} className={`px-2 py-1.5 rounded-lg text-[11px] font-bold ${favoritesOnly ? "bg-yellow-500 text-black" : "bg-white/10 text-white/70"}`}>Favorites</button>
                <button onClick={() => setVerifiedOnly((v) => !v)} className={`px-2 py-1.5 rounded-lg text-[11px] font-bold ${verifiedOnly ? "bg-blue-500 text-white" : "bg-white/10 text-white/70"}`}>Verified</button>
                <button onClick={() => setFreshOnly((v) => !v)} className={`px-2 py-1.5 rounded-lg text-[11px] font-bold ${freshOnly ? "bg-emerald-500 text-[#052214]" : "bg-white/10 text-white/70"}`}>Fresh</button>
                <button onClick={() => setSortBy(sortBy === "distance" ? "price" : "distance")} className="px-2 py-1.5 rounded-lg text-[11px] font-bold bg-white/10 text-white/70">{sortBy === "distance" ? "Nearest" : "Cheapest"}</button>
              </div>
              <div className="flex gap-1.5 overflow-x-auto hide-scrollbar">
                {BRANDS.map((brand) => (
                  <button key={brand} onClick={() => setBrandFilter(brand)} className={`px-3 py-1.5 rounded-lg whitespace-nowrap text-[11px] font-bold ${brandFilter === brand ? "bg-[#FF6200]" : "bg-white/10 text-white/70"}`}>
                    {brand}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="mt-2 flex gap-2">
            {(["peek", "mid", "full"] as MobileSheetSize[]).map((size) => (
              <button
                key={size}
                onClick={() => setMobileSheetSize(size)}
                className={`flex-1 py-1.5 rounded-lg text-[10px] uppercase font-bold ${mobileSheetSize === size ? "bg-white text-black" : "bg-white/10 text-white/70"}`}
              >
                {size}
              </button>
            ))}
          </div>
        </div>

        <div className="px-3 pt-3 pb-20 overflow-y-auto hide-scrollbar space-y-2">
          <div className="grid grid-cols-3 gap-2">
            {bestNowStations.map((station) => {
              const price = activeFuelType === "diesel" ? station.diesel_price : station.petrol_price;
              const trust = getStationTrust(station);
              return (
                <button key={`mobile-best-${station.id}`} onClick={() => handleSelectStation(station)} className="text-left rounded-xl bg-white/8 border border-white/10 p-2">
                  <p className="text-[11px] font-bold truncate">{station.name}</p>
                  <p className={`text-sm font-black mt-1 ${activeFuelType === "diesel" ? "text-[#FF6200]" : "text-blue-400"}`}>{price ? `R${price.toFixed(2)}` : "--"}</p>
                  <p className={`text-[10px] mt-1 font-bold ${trust.tier === "high" ? "text-emerald-400" : trust.tier === "medium" ? "text-amber-400" : "text-red-400"}`}>
                    Trust {trust.score}
                  </p>
                </button>
              );
            })}
          </div>

          {listStations.map((station) => {
            const price = activeFuelType === "diesel" ? station.diesel_price : station.petrol_price;
            const isSelected = station.id && selectedStation?.id === station.id;
            const isStale = Date.now() - station.last_updated > 7 * 24 * 60 * 60 * 1000;
            const trust = getStationTrust(station);
            return (
              <div
                id={`station-card-${station.id}`}
                key={`mobile-${station.id}`}
                className={`rounded-xl border p-3 ${isSelected ? "bg-emerald-500/12 border-emerald-400/50" : "bg-white/6 border-white/10"}`}
                onClick={() => handleSelectStation(station)}
              >
                <div className="flex justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-bold text-sm truncate">{station.name}</p>
                    <p className="text-[11px] text-white/45 truncate mt-0.5">{station.address}</p>
                    <p className="text-[10px] text-white/45 mt-1 flex items-center gap-2">
                      <span>{station.distance !== undefined ? `${station.distance.toFixed(1)} km` : "National"}</span>
                      <span>·</span>
                      <span>{formatRelativeTime(station.last_updated)}</span>
                      {isStale ? <ShieldAlert className="w-3 h-3 text-amber-500" /> : <CheckCircle2 className="w-3 h-3 text-emerald-400" />}
                      <span className={trust.tier === "high" ? "text-emerald-400" : trust.tier === "medium" ? "text-amber-400" : "text-red-400"}>
                        Trust {trust.score}
                      </span>
                    </p>
                  </div>
                  <p className={`text-lg font-black ${activeFuelType === "diesel" ? "text-[#FF6200]" : "text-blue-400"}`}>{price ? `R${price.toFixed(2)}` : "--"}</p>
                </div>

                <div className="mt-2 flex gap-1.5 flex-wrap">
                  <a href={`https://www.google.com/maps/dir/?api=1&destination=${station.lat},${station.lng}`} target="_blank" rel="noreferrer" className="px-2 py-1 rounded-md bg-blue-500/15 text-blue-400 text-[10px] font-bold">Go</a>
                  <button onClick={(e) => { e.stopPropagation(); handleOpenReport(station); }} className="px-2 py-1 rounded-md bg-[#FF6200]/20 text-[#FF8A45] text-[10px] font-bold">Report</button>
                  <button data-guidance="guidance-trend" onClick={(e) => { e.stopPropagation(); handleOpenDetails(station); }} className="px-2 py-1 rounded-md bg-white/10 text-white/70 text-[10px] font-bold">Trend</button>
                </div>
              </div>
            );
          })}

          <div className="grid grid-cols-2 gap-2 pt-1">
            <button
              onClick={() => {
                triggerHaptic();
                locateUser();
              }}
              className="py-2.5 rounded-xl bg-white/10 text-xs font-bold flex items-center justify-center gap-2"
            >
              <LocateFixed className="w-4 h-4 text-[#FF6200]" /> Locate me
            </button>
            <button
              onClick={() => triggerShare("TankUp - SA Fuel Community", "Find the best verified fuel prices in South Africa.", window.location.href)}
              className="py-2.5 rounded-xl bg-white/10 text-xs font-bold flex items-center justify-center gap-2"
            >
              <Share2 className="w-4 h-4" /> Share
            </button>
          </div>

          <div className="rounded-xl bg-white/5 border border-white/10 p-3 text-xs">
            <p className="uppercase tracking-widest text-white/45 font-bold">Smart fill</p>
            <p className="text-sm font-black mt-1">{fillRecommendation.title}</p>
            <p className="text-[11px] text-white/60 mt-1">{fillRecommendation.detail}</p>
          </div>

          <div className="rounded-xl bg-white/5 border border-white/10 p-3 text-xs">
            <p className="uppercase tracking-widest text-white/45 font-bold">Community stats</p>
            <div className="mt-2 grid grid-cols-3 gap-2 text-center">
              <div>
                <p className="text-lg font-black text-[#FF6200]">R{communityStats.savedRand.toLocaleString()}</p>
                <p className="text-[10px] text-white/45 uppercase">Saved</p>
              </div>
              <div>
                <p className="text-lg font-black">{communityStats.drivers}</p>
                <p className="text-[10px] text-white/45 uppercase">24h reports</p>
              </div>
              <div>
                <p className="text-lg font-black">{listStations.length + bestNowStations.length}</p>
                <p className="text-[10px] text-white/45 uppercase">Visible</p>
              </div>
            </div>
          </div>

          {visits === 0 && (
            <div className="rounded-xl bg-[#FF6200]/15 border border-[#FF6200]/30 p-3 text-center">
              <p className="text-sm font-black">First time here?</p>
              <p className="text-xs text-white/70 mt-1">Tap report to help the community with fresh prices.</p>
            </div>
          )}
        </div>
      </section>

      <button
        onClick={() => {
          triggerHaptic();
          triggerShare("TankUp - SA Fuel Community", "Find the best verified fuel prices in SA.", window.location.href).then((s) => {
            if (s) toast.success("Share link copied!");
          });
        }}
        className="hidden lg:flex absolute right-5 bottom-24 z-40 w-12 h-12 rounded-2xl bg-[#0D1320]/95 border border-white/10 items-center justify-center hover:bg-[#161B28]"
      >
        <Share2 className="w-5 h-5" />
      </button>
      <button
        onClick={locateUser}
        className="hidden lg:flex absolute right-5 bottom-9 z-40 w-12 h-12 rounded-2xl bg-[#0D1320]/95 border border-white/10 items-center justify-center hover:bg-[#161B28]"
      >
        <LocateFixed className="w-5 h-5 text-[#FF6200]" />
      </button>

      {selectedStation && (
        <button
          onClick={() => handleOpenDetails(selectedStation)}
          className="hidden lg:flex absolute left-[calc(min(32vw,460px)+2rem)] bottom-5 z-40 px-3 py-2 rounded-xl bg-[#0D1320]/95 border border-white/10 text-xs font-bold items-center gap-2"
        >
          <ChevronUp className="w-4 h-4" /> Open station details
        </button>
      )}

      <GuidanceOverlay
        open={isGuidanceOpen}
        step={currentGuidanceStep}
        stepIndex={currentGuidanceStepIndex}
        totalSteps={GUIDANCE_STEPS.length}
        onNext={handleGuidanceNext}
        onSkipAll={handleDismissGuidance}
      />

      <ReportModal
        open={isReportModalOpen}
        onOpenChange={setIsReportModalOpen}
        station={selectedStation}
        onReport={handleReportTask}
        userLocation={userLocation}
        communityDrivers={communityStats.drivers}
      />

      <StationDetailsModal
        open={!!detailsStation}
        onClose={() => setDetailsStation(null)}
        station={detailsStation}
        activeFuelType={activeFuelType}
      />
    </div>
  );
}
