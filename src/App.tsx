import { lazy, Suspense, useState, useMemo, useEffect, useCallback } from "react";
import { useStations } from "./hooks/useStations";
import { Station } from "./types";
import { calculateDistance } from "./lib/utils";
import { matchesBrandFilter } from "./lib/stationIdentity";
import { ChevronUp, LocateFixed, Share2 } from "lucide-react";
import { Toaster, toast } from "sonner";
import { auth, signInWithGoogle, logOut } from "./lib/firebase";
import { useAuthState } from "react-firebase-hooks/auth";
import { triggerHaptic, triggerShare, seedDatabase } from "./lib/seedData";
import { getFillRecommendation } from "./lib/trust";
import { GUIDANCE_STEPS, GUIDANCE_STORAGE_KEY, defaultGuidanceState, GuidanceAction, GuidanceState } from "./lib/guidance";
import { AppHeader } from "./features/AppHeader";
import { DesktopRail } from "./features/DesktopRail";
import { MobileSheet } from "./features/MobileSheet";
import { OnboardingController } from "./features/OnboardingController";

const MapView = lazy(() => import("./components/Map").then((m) => ({ default: m.MapView })));
const ReportModal = lazy(() => import("./components/ReportModal").then((m) => ({ default: m.ReportModal })));
const StationDetailsModal = lazy(() => import("./components/StationDetailsModal").then((m) => ({ default: m.StationDetailsModal })));
const GuidanceOverlay = lazy(() => import("./components/GuidanceOverlay").then((m) => ({ default: m.GuidanceOverlay })));

type MobileSheetSize = "peek" | "mid" | "full";

export default function App() {
  const [userLocation, setUserLocation] = useState<[number, number] | null>(null);
  const [tankSize, setTankSize] = useState<number>(70);
  const [browseScope, setBrowseScope] = useState<"nearby" | "south_africa">("south_africa");
  const { stations, communityStats, reportPrice, pendingWrites, loading: dataLoading } = useStations(userLocation, tankSize, browseScope);
  const [activeFuelType, setActiveFuelType] = useState<"diesel" | "petrol">("diesel");
  const [brandFilter, setBrandFilter] = useState<string>("All");
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [verifiedOnly, setVerifiedOnly] = useState(false);
  const [freshOnly, setFreshOnly] = useState(false);
  const [decisionMode, setDecisionMode] = useState(false);
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
  const [mapTileTimeout, setMapTileTimeout] = useState(false);
  const [locationDenied, setLocationDenied] = useState(false);
  const [mobileSheetSize, setMobileSheetSize] = useState<MobileSheetSize>("mid");
  const [showMobileFilters, setShowMobileFilters] = useState(false);
  const [guidance, setGuidance] = useState<GuidanceState>(defaultGuidanceState);
  const [isGuidanceOpen, setIsGuidanceOpen] = useState(false);
  const [bootStartedAt] = useState(() => Date.now());
  const [bootNow, setBootNow] = useState(() => Date.now());
  const systemOpsAllowList = useMemo(
    () =>
      (import.meta.env.VITE_SYSTEM_OPS_EMAILS || "")
        .split(",")
        .map((entry) => entry.trim().toLowerCase())
        .filter(Boolean),
    []
  );
  const canSeedStations = useMemo(() => {
    const email = user?.email?.toLowerCase();
    return Boolean(email && systemOpsAllowList.includes(email));
  }, [systemOpsAllowList, user?.email]);

  const isInSouthAfrica = (lat: number, lng: number) => lat >= -35.5 && lat <= -21.5 && lng >= 16 && lng <= 33.5;
  const markGuidanceAction = useCallback((action: GuidanceAction) => setGuidance((prev) => (prev.actions[action] ? prev : { ...prev, actions: { ...prev.actions, [action]: true } })), []);

  useEffect(() => {
    const shellReadyMs = 650;
    const timeout = setTimeout(() => setIsAppReady(true), shellReadyMs);
    return () => clearTimeout(timeout);
  }, []);

  useEffect(() => {
    if (isAppReady) return;
    const tick = window.setInterval(() => setBootNow(Date.now()), 120);
    return () => clearInterval(tick);
  }, [isAppReady]);

  useEffect(() => {
    if (mapReady || mapTileTimeout) return;
    const timeout = window.setTimeout(() => setMapTileTimeout(true), 3800);
    return () => window.clearTimeout(timeout);
  }, [mapReady, mapTileTimeout]);

  useEffect(() => {
    const saved = localStorage.getItem("tankup_favorites");
    if (saved) {
      try { setFavorites(JSON.parse(saved)); } catch (e) { console.error("Failed to parse favorites", e); }
    }
  }, []);

  useEffect(() => {
    const saved = localStorage.getItem(GUIDANCE_STORAGE_KEY);
    if (!saved) return;
    try {
      const parsed = JSON.parse(saved) as GuidanceState;
      setGuidance({ dismissed: Boolean(parsed.dismissed), completedSteps: Array.isArray(parsed.completedSteps) ? parsed.completedSteps : [], actions: parsed.actions || {}, lastShownAt: parsed.lastShownAt });
    } catch (error) { console.error("Failed to parse guidance state", error); }
  }, []);
  useEffect(() => { localStorage.setItem(GUIDANCE_STORAGE_KEY, JSON.stringify(guidance)); }, [guidance]);

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
    const handleInstallPrompt = (e: any) => { e.preventDefault(); const dismissed = localStorage.getItem("tankup_install_prompt_dismissed") === "1"; if (v >= 1 && !dismissed) setDeferredPrompt(e); };
    const handleInstalled = () => { setDeferredPrompt(null); setShowIosInstallHint(false); localStorage.setItem("tankup_install_prompt_dismissed", "1"); toast.success("TankUp installed"); };
    const handlePwaUpdateReady = () => setShowUpdatePrompt(true);
    const handlePwaOfflineReady = () => toast.success("Offline mode ready");
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);

    window.addEventListener("beforeinstallprompt", handleInstallPrompt);
    window.addEventListener("appinstalled", handleInstalled);
    window.addEventListener("tankup:pwa-update-ready", handlePwaUpdateReady as EventListener);
    window.addEventListener("tankup:pwa-offline-ready", handlePwaOfflineReady as EventListener);
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
    const isStandalone = window.matchMedia("(display-mode: standalone)").matches || (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
    const ua = navigator.userAgent.toLowerCase();
    const isIos = /iphone|ipad|ipod/.test(ua);
    const isSafari = /safari/.test(ua) && !/chrome|crios|fxios/.test(ua);
    const dismissed = localStorage.getItem("tankup_ios_install_hint_dismissed") === "1";
    setShowIosInstallHint(isIos && isSafari && !isStandalone && !dismissed);
  }, []);

  const locateUser = () => {
    if (!navigator.geolocation) {
      setLocationDenied(true);
      setBrowseScope("south_africa");
      toast.info("Location unavailable. Showing national South Africa view.");
      return;
    }
    navigator.geolocation.getCurrentPosition((pos) => {
      const next: [number, number] = [pos.coords.latitude, pos.coords.longitude];
      if (!Number.isFinite(next[0]) || !Number.isFinite(next[1])) {
        setLocationDenied(true);
        toast.error("Invalid location received. Please retry.");
        return;
      }
      setUserLocation(next);
      if (!isInSouthAfrica(next[0], next[1])) { setBrowseScope("south_africa"); toast.info("You appear outside South Africa. Switched to national South Africa view."); }
      setLocationDenied(false);
    }, (err) => {
      console.error("Location error", err);
      setLocationDenied(true);
      setBrowseScope("south_africa");
      toast.info("Location access denied. Showing national South Africa view.");
    }, { enableHighAccuracy: true });
  };

  const avgPrice = useMemo(() => {
    const prices = stations.map((s) => (activeFuelType === "diesel" ? s.diesel_price : s.petrol_price)).filter((p): p is number => p !== null && p > 0);
    if (prices.length === 0) return 0;
    return prices.reduce((a, b) => a + b, 0) / prices.length;
  }, [stations, activeFuelType]);

  const sortedStations = useMemo(() => {
    const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
    let stats = [...stations].filter((s) => Number.isFinite(s.lat) && Number.isFinite(s.lng));
    if (favoritesOnly) stats = stats.filter((s) => s.id && favorites.includes(s.id));
    if (verifiedOnly) stats = stats.filter((s) => Boolean(s.latest_image_url));
    if (freshOnly) stats = stats.filter((s) => Date.now() - s.last_updated < sevenDaysMs);
    if (brandFilter !== "All") stats = stats.filter((s) => matchesBrandFilter(s, brandFilter));
    if (browseScope === "nearby" && userLocation) stats = stats.map((s) => ({ ...s, distance: calculateDistance(userLocation[0], userLocation[1], s.lat, s.lng) }));
    if (decisionMode && userLocation) {
      stats = stats
        .map((s) => ({ ...s, distance: calculateDistance(userLocation[0], userLocation[1], s.lat, s.lng) }))
        .filter((s) => (s.distance ?? 9999) <= 10)
        .sort((a, b) => {
          const trustGap = (b.verification_confidence ?? 0) - (a.verification_confidence ?? 0);
          if (trustGap !== 0) return trustGap;
          const priceA = activeFuelType === "diesel" ? a.diesel_price : a.petrol_price;
          const priceB = activeFuelType === "diesel" ? b.diesel_price : b.petrol_price;
          if (!priceA && !priceB) return 0;
          if (!priceA) return 1;
          if (!priceB) return -1;
          return priceA - priceB;
        })
        .slice(0, 3);
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
  }, [stations, favoritesOnly, favorites, verifiedOnly, freshOnly, brandFilter, browseScope, userLocation, sortBy, activeFuelType, decisionMode]);

  const bestNowStations = useMemo(() => sortedStations.slice(0, 3), [sortedStations]);
  const listStations = useMemo(() => sortedStations.slice(bestNowStations.length), [sortedStations, bestNowStations.length]);
  const recommendationTarget = selectedStation || sortedStations[0] || null;
  const recommendationPrice = recommendationTarget ? (activeFuelType === "diesel" ? recommendationTarget.diesel_price : recommendationTarget.petrol_price) : null;
  const fillRecommendation = useMemo(() => getFillRecommendation(recommendationTarget, avgPrice, recommendationPrice, tankSize), [recommendationTarget, avgPrice, recommendationPrice, tankSize]);

  const handleMapMarkerClick = (station: Station) => {
    markGuidanceAction("station_selected");
    setRecentReportId(station.id || null);
    setTimeout(() => setRecentReportId(null), 1000);
    document.getElementById(`station-card-${station.id}`)?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    setSelectedStation(station);
  };

  const handleOpenReport = (station?: Station | { lat: number; lng: number }) => {
    markGuidanceAction("report_opened");
    triggerHaptic();
    let targetStation: any = station || null;
    if (!targetStation && sortedStations.length > 0 && sortedStations[0].distance !== undefined && sortedStations[0].distance <= 0.2) { targetStation = sortedStations[0]; toast.info(`Auto-selected: ${targetStation.name}`); }
    else if (targetStation && !("name" in targetStation)) targetStation = { lat: targetStation.lat, lng: targetStation.lng, name: "", address: "" };
    setSelectedStation(targetStation);
    setIsReportModalOpen(true);
  };

  const handleReportTask = async (
    stationData: Partial<Station> | null,
    fuelTypes: ("diesel" | "petrol")[],
    prices: { diesel?: number; petrol?: number },
    file?: File | null,
    extras?: { queue_time_minutes?: number | null; amenities?: { shop?: boolean; card_pay?: boolean; safety_lights?: boolean } }
  ) => {
    const id = await reportPrice(selectedStation?.id, stationData, fuelTypes, prices, file, extras);
    if (id) { markGuidanceAction("report_submitted"); setRecentReportId(id); setTimeout(() => setRecentReportId(null), 4000); }
  };

  const handleInstallClick = () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    deferredPrompt.userChoice.then((choice: { outcome?: string }) => {
      if (choice?.outcome === "accepted") localStorage.setItem("tankup_install_prompt_dismissed", "1");
      setDeferredPrompt(null);
    });
  };

  const handleApplyUpdate = async () => {
    try { await window.__tankupTriggerSwUpdate?.(true); }
    catch (error) { console.error("Failed to update service worker", error); toast.error("Update failed. Please refresh."); }
  };

  const formatRelativeTime = (timestamp: number) => {
    const diffMins = Math.max(1, Math.floor((Date.now() - timestamp) / 60000));
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    return `${Math.floor(diffHours / 24)}d ago`;
  };

  const currentGuidanceStep = useMemo(() => {
    if (guidance.dismissed || visits > 3) return null;
    return GUIDANCE_STEPS.find((step) => Boolean(guidance.actions[step.triggerAction]) && !guidance.completedSteps.includes(step.id)) || null;
  }, [guidance, visits]);
  const currentGuidanceStepIndex = useMemo(() => (currentGuidanceStep ? GUIDANCE_STEPS.findIndex((step) => step.id === currentGuidanceStep.id) : -1), [currentGuidanceStep]);

  useEffect(() => {
    if (!currentGuidanceStep) return setIsGuidanceOpen(false);
    const now = Date.now();
    if (guidance.lastShownAt && now - guidance.lastShownAt < 5000) return;
    setIsGuidanceOpen(true);
    setGuidance((prev) => ({ ...prev, lastShownAt: now }));
  }, [currentGuidanceStep, guidance.lastShownAt]);

  useEffect(() => {
    if (!currentGuidanceStep?.completeOnAction || !guidance.actions[currentGuidanceStep.completeOnAction]) return;
    setGuidance((prev) => (prev.completedSteps.includes(currentGuidanceStep.id) ? prev : { ...prev, completedSteps: [...prev.completedSteps, currentGuidanceStep.id] }));
    setIsGuidanceOpen(false);
  }, [currentGuidanceStep, guidance.actions]);

  const sheetHeightClass = mobileSheetSize === "peek" ? "h-[26dvh]" : mobileSheetSize === "mid" ? "h-[56dvh]" : "h-[92dvh]";
  const mobileSheetHeight = mobileSheetSize === "peek" ? "26dvh" : mobileSheetSize === "mid" ? "56dvh" : "92dvh";
  const scopeLabel = browseScope === "nearby" ? "Nearby 100km" : "South Africa";
  const bootElapsed = bootNow - bootStartedAt;
  const bootProgress = useMemo(() => {
    if (isAppReady) return 100;
    const elapsedProgress = Math.min(70, Math.floor((bootElapsed / 2200) * 70));
    const mapContribution = mapReady ? 15 : 0;
    const dataContribution = dataLoading ? 0 : 15;
    return Math.max(20, elapsedProgress + mapContribution + dataContribution);
  }, [isAppReady, bootElapsed, mapReady, dataLoading]);
  const bootPhaseLabel = useMemo(() => {
    if (isAppReady) return "Ready";
    if (dataLoading && !mapReady) return "Loading map & stations";
    if (!dataLoading && !mapReady) return "Finalizing map";
    if (dataLoading && mapReady) return "Syncing stations";
    return "Starting experience";
  }, [isAppReady, dataLoading, mapReady]);

  return (
    <div className="relative h-dvh w-full overflow-hidden bg-[#070B12] text-white font-sans">
      <Toaster theme="dark" position="top-center" />

      <OnboardingController
        isAppReady={isAppReady}
        locationDenied={locationDenied}
        isOffline={isOffline}
        pendingWrites={pendingWrites}
        bootProgress={bootProgress}
        bootPhaseLabel={bootPhaseLabel}
        showUpdatePrompt={showUpdatePrompt}
        setIsAppReady={setIsAppReady}
        onApplyUpdate={handleApplyUpdate}
        onDismissUpdate={() => setShowUpdatePrompt(false)}
      />

      <div
        data-guidance="guidance-map"
        className={`absolute inset-0 transition-all duration-700 ${mapTileTimeout && !mapReady ? "opacity-20 saturate-50 blur-[1px] pointer-events-none" : "opacity-100"}`}
      >
        <Suspense fallback={null}>
          <MapView
            stations={sortedStations}
            userLocation={browseScope === "nearby" ? userLocation : null}
            activeFuelType={activeFuelType}
            onMapReady={() => { setMapReady(true); setMapTileTimeout(false); markGuidanceAction("map_ready"); }}
            onReportClick={(st) => handleOpenReport(st)}
            onStationSelect={handleMapMarkerClick}
            onLocationReport={(latLng) => handleOpenReport({ lat: latLng[0], lng: latLng[1] })}
            recentReportId={recentReportId}
          />
        </Suspense>
      </div>

      <AppHeader
        isOffline={isOffline}
        pendingWrites={pendingWrites}
        scopeLabel={scopeLabel}
        activeFuelType={activeFuelType}
        setActiveFuelType={setActiveFuelType}
        tankSize={tankSize}
        setTankSize={setTankSize}
        deferredPrompt={deferredPrompt}
        showIosInstallHint={showIosInstallHint}
        onInstallClick={handleInstallClick}
        onDismissInstallPrompt={() => { setDeferredPrompt(null); localStorage.setItem("tankup_install_prompt_dismissed", "1"); }}
        onDismissIosPrompt={() => { setShowIosInstallHint(false); localStorage.setItem("tankup_ios_install_hint_dismissed", "1"); }}
        onReopenGuidance={() => { setGuidance((prev) => ({ ...prev, dismissed: false, completedSteps: [], lastShownAt: undefined })); setIsGuidanceOpen(true); }}
        user={user}
        isProfileOpen={isProfileOpen}
        setIsProfileOpen={setIsProfileOpen}
        canSeedStations={canSeedStations}
        onSeedStations={async () => {
          const telemetryBase = {
            event: "seed_attempt",
            at: new Date().toISOString(),
            actor_uid: user?.uid || null,
            actor_email: user?.email || null,
            actor_is_system_ops: canSeedStations
          };
          console.info("seed.telemetry.start", telemetryBase);

          if (!canSeedStations) {
            console.warn("seed.telemetry.blocked", { ...telemetryBase, reason: "non-system-ops" });
            toast.info("Seeding is managed by system ops.");
            setIsProfileOpen(false);
            return;
          }

          const result = await seedDatabase();
          console.info("seed.telemetry.result", { ...telemetryBase, result });
          if (result === "seeded") toast.success("South African database initialized");
          else if (result === "already-seeded") toast.info("Seed already applied on server");
          else toast.error("Seeding failed");
          setIsProfileOpen(false);
        }}
        onBlockedSeedAttempt={() => {
          console.warn("seed.telemetry.blocked-ui", {
            event: "seed_attempt_blocked_ui",
            at: new Date().toISOString(),
            actor_uid: user?.uid || null,
            actor_email: user?.email || null
          });
          toast.info("Seeding is managed by system ops.");
        }}
        onLogOut={() => { logOut(); setIsProfileOpen(false); }}
        onSignIn={signInWithGoogle}
      />

      {!userLocation && browseScope !== "nearby" && (
        <div className="absolute left-1/2 top-24 z-40 -translate-x-1/2 rounded-2xl border border-white/15 bg-[#0D1320]/95 px-4 py-3 text-xs shadow-2xl backdrop-blur-xl">
          <p className="font-semibold text-white">Use your location for nearby prices and route-ready ranking.</p>
          <button
            onClick={() => { triggerHaptic(); locateUser(); setBrowseScope("nearby"); }}
            className="mt-2 inline-flex items-center gap-2 rounded-lg bg-[#FF6200] px-3 py-1.5 font-bold text-white hover:bg-[#E65800]"
          >
            <LocateFixed className="h-3.5 w-3.5" /> Use my location
          </button>
        </div>
      )}

      <DesktopRail
        activeFuelType={activeFuelType}
        browseScope={browseScope}
        setBrowseScope={(scope) => {
          if (scope === "nearby" && !userLocation) locateUser();
          setBrowseScope(scope);
        }}
        favoritesOnly={favoritesOnly}
        setFavoritesOnly={setFavoritesOnly}
        verifiedOnly={verifiedOnly}
        setVerifiedOnly={setVerifiedOnly}
        freshOnly={freshOnly}
        setFreshOnly={setFreshOnly}
        decisionMode={decisionMode}
        setDecisionMode={setDecisionMode}
        sortBy={sortBy}
        setSortBy={setSortBy}
        brandFilter={brandFilter}
        setBrandFilter={setBrandFilter}
        fillRecommendation={fillRecommendation}
        bestNowStations={bestNowStations}
        listStations={listStations}
        selectedStation={selectedStation}
        favorites={favorites}
        avgPrice={avgPrice}
        tankSize={tankSize}
        communitySavedRand={communityStats.savedRand}
        onOpenReport={(station) => handleOpenReport(station)}
        onSelectStation={(station) => { markGuidanceAction("station_selected"); setSelectedStation(station); }}
        onOpenDetails={(station) => { markGuidanceAction("details_opened"); setDetailsStation(station); }}
        onToggleFavorite={toggleFavorite}
        formatRelativeTime={formatRelativeTime}
        markFiltersOpened={() => markGuidanceAction("filters_opened")}
        loading={dataLoading}
      />

      <MobileSheet
        mobileSheetHeight={mobileSheetHeight}
        sheetHeightClass={sheetHeightClass}
        mobileSheetSize={mobileSheetSize}
        setMobileSheetSize={setMobileSheetSize}
        activeFuelType={activeFuelType}
        setActiveFuelType={setActiveFuelType}
        browseScope={browseScope}
        setBrowseScope={(scope) => {
          if (scope === "nearby" && !userLocation) locateUser();
          setBrowseScope(scope);
        }}
        showMobileFilters={showMobileFilters}
        setShowMobileFilters={setShowMobileFilters}
        favoritesOnly={favoritesOnly}
        setFavoritesOnly={setFavoritesOnly}
        verifiedOnly={verifiedOnly}
        setVerifiedOnly={setVerifiedOnly}
        freshOnly={freshOnly}
        setFreshOnly={setFreshOnly}
        decisionMode={decisionMode}
        setDecisionMode={setDecisionMode}
        sortBy={sortBy}
        setSortBy={setSortBy}
        brandFilter={brandFilter}
        setBrandFilter={setBrandFilter}
        bestNowStations={bestNowStations}
        listStations={listStations}
        selectedStation={selectedStation}
        fillRecommendation={fillRecommendation}
        communityStats={communityStats}
        visits={visits}
        onOpenReport={(station) => handleOpenReport(station)}
        onSelectStation={(station) => { markGuidanceAction("station_selected"); setSelectedStation(station); }}
        onOpenDetails={(station) => { markGuidanceAction("details_opened"); setDetailsStation(station); }}
        onLocateUser={() => { triggerHaptic(); locateUser(); }}
        onShare={() => triggerShare("TankUp - SA Fuel Community", "Find the best verified fuel prices in South Africa.", window.location.href)}
        markFiltersOpened={() => markGuidanceAction("filters_opened")}
        formatRelativeTime={formatRelativeTime}
        loading={dataLoading}
      />

      {mapTileTimeout && !mapReady && (
        <div className="absolute inset-x-3 top-24 z-[85] md:left-5 md:right-auto md:w-[min(32vw,460px)]">
          <div className="rounded-2xl border border-amber-300/35 bg-[#0D1421]/92 px-4 py-3 text-xs text-amber-100 shadow-2xl backdrop-blur-xl">
            Map tiles are taking longer than expected. Showing list-first mode while the map catches up.
          </div>
        </div>
      )}

      <button onClick={() => { triggerHaptic(); triggerShare("TankUp - SA Fuel Community", "Find the best verified fuel prices in SA.", window.location.href).then((s) => s && toast.success("Share link copied!")); }} className="hidden lg:flex absolute right-5 bottom-24 z-40 w-12 h-12 rounded-2xl bg-[#0D1320]/95 border border-white/10 items-center justify-center hover:bg-[#161B28]"><Share2 className="w-5 h-5" /></button>
      <button onClick={locateUser} className="hidden lg:flex absolute right-5 bottom-9 z-40 w-12 h-12 rounded-2xl bg-[#0D1320]/95 border border-white/10 items-center justify-center hover:bg-[#161B28]"><LocateFixed className="w-5 h-5 text-[#FF6200]" /></button>

      {selectedStation && (
        <button onClick={() => { markGuidanceAction("details_opened"); setDetailsStation(selectedStation); }} className="hidden lg:flex absolute left-[calc(min(32vw,460px)+2rem)] bottom-5 z-40 px-3 py-2 rounded-xl bg-[#0D1320]/95 border border-white/10 text-xs font-bold items-center gap-2">
          <ChevronUp className="w-4 h-4" /> Open station details
        </button>
      )}

      <Suspense fallback={null}>
        <GuidanceOverlay open={isGuidanceOpen} step={currentGuidanceStep} stepIndex={currentGuidanceStepIndex} totalSteps={GUIDANCE_STEPS.length} onNext={() => {
          if (!currentGuidanceStep || currentGuidanceStep.completeOnAction) return setIsGuidanceOpen(false);
          setGuidance((prev) => (prev.completedSteps.includes(currentGuidanceStep.id) ? prev : { ...prev, completedSteps: [...prev.completedSteps, currentGuidanceStep.id] }));
          setIsGuidanceOpen(false);
        }} onSkipAll={() => { setGuidance((prev) => ({ ...prev, dismissed: true })); setIsGuidanceOpen(false); }} />

        <ReportModal open={isReportModalOpen} onOpenChange={setIsReportModalOpen} station={selectedStation} onReport={handleReportTask} userLocation={userLocation} communityReports24h={communityStats.reports24h} />

        <StationDetailsModal open={!!detailsStation} onClose={() => setDetailsStation(null)} station={detailsStation} activeFuelType={activeFuelType} />
      </Suspense>
    </div>
  );
}
