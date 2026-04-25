import { CheckCircle2, ChevronDown, LocateFixed, MapPin, Share2, ShieldAlert, SlidersHorizontal } from "lucide-react";
import { useState } from "react";
import { Station } from "../types";
import { getStationTrust, getTrustBreakdown } from "../lib/trust";

const BRANDS = ["All", "Engen", "Sasol", "Shell", "BP", "Astron Energy", "TotalEnergies", "Independent"];

type MobileSheetSize = "peek" | "mid" | "full";

type Props = {
  loading: boolean;
  mobileSheetHeight: string;
  sheetHeightClass: string;
  mobileSheetSize: MobileSheetSize;
  setMobileSheetSize: (size: MobileSheetSize) => void;
  activeFuelType: "diesel" | "petrol";
  setActiveFuelType: (fuel: "diesel" | "petrol") => void;
  browseScope: "nearby" | "south_africa";
  setBrowseScope: (scope: "nearby" | "south_africa") => void;
  showMobileFilters: boolean;
  setShowMobileFilters: (show: boolean) => void;
  favoritesOnly: boolean;
  setFavoritesOnly: (v: boolean) => void;
  verifiedOnly: boolean;
  setVerifiedOnly: (v: boolean) => void;
  freshOnly: boolean;
  setFreshOnly: (v: boolean) => void;
  decisionMode: boolean;
  setDecisionMode: (v: boolean) => void;
  sortBy: "distance" | "price";
  setSortBy: (v: "distance" | "price") => void;
  brandFilter: string;
  setBrandFilter: (v: string) => void;
  bestNowStations: Station[];
  listStations: Station[];
  selectedStation: Station | null;
  fillRecommendation: { title: string; detail: string };
  communityStats: { reports24h: number; savedRand: number };
  visits: number;
  onOpenReport: (station?: Station) => void;
  onSelectStation: (station: Station) => void;
  onOpenDetails: (station: Station) => void;
  onLocateUser: () => void;
  onShare: () => void;
  markFiltersOpened: () => void;
  formatRelativeTime: (timestamp: number) => string;
};

export function MobileSheet(props: Props) {
  const {
    loading,
    mobileSheetHeight,
    sheetHeightClass,
    mobileSheetSize,
    setMobileSheetSize,
    activeFuelType,
    setActiveFuelType,
    browseScope,
    setBrowseScope,
    showMobileFilters,
    setShowMobileFilters,
    favoritesOnly,
    setFavoritesOnly,
    verifiedOnly,
    setVerifiedOnly,
    freshOnly,
    setFreshOnly,
    decisionMode,
    setDecisionMode,
    sortBy,
    setSortBy,
    brandFilter,
    setBrandFilter,
    bestNowStations,
    listStations,
    selectedStation,
    fillRecommendation,
    communityStats,
    visits,
    onOpenReport,
    onSelectStation,
    onOpenDetails,
    onLocateUser,
    onShare,
    markFiltersOpened,
    formatRelativeTime,
  } = props;
  const [showInsights, setShowInsights] = useState(false);

  return (
    <>
      <button onClick={() => onOpenReport()} data-guidance="guidance-report" className="lg:hidden absolute right-4 z-[60] w-14 h-14 rounded-2xl bg-[#FF6200] hover:bg-[#E65800] text-white shadow-[0_18px_36px_rgba(255,98,0,0.45)] flex items-center justify-center transition-[bottom] duration-300" style={{ bottom: `calc(${mobileSheetHeight} + env(safe-area-inset-bottom, 0px) + 0.75rem)` }} aria-label="Report price"><MapPin className="w-6 h-6" /></button>

      <section className={`lg:hidden absolute left-0 right-0 bottom-0 z-50 ${sheetHeightClass} rounded-t-[30px] border-t border-white/10 bg-[#0D1421]/96 backdrop-blur-3xl shadow-[0_-24px_50px_rgba(0,0,0,0.45)] transition-all duration-300 flex flex-col`}>
        <div className="px-4 pt-3 pb-2 border-b border-white/10">
          <div className="flex items-center justify-between gap-2"><button onClick={() => setMobileSheetSize(mobileSheetSize === "full" ? "mid" : "full")} className="mx-auto block w-12 h-1.5 rounded-full bg-white/20" aria-label="Resize panel" /></div>
          <div className="mt-3 flex items-center gap-2">
            <button onClick={() => setActiveFuelType(activeFuelType === "diesel" ? "petrol" : "diesel")} className={`px-3 py-2 rounded-xl text-xs font-black ${activeFuelType === "diesel" ? "bg-[#FF6200]" : "bg-blue-600"}`}>{activeFuelType === "diesel" ? "Diesel" : "Petrol"}</button>
            <button onClick={() => setBrowseScope(browseScope === "nearby" ? "south_africa" : "nearby")} className="px-3 py-2 rounded-xl text-xs font-bold bg-white/10">{browseScope === "nearby" ? "Nearby" : "South Africa"}</button>
            <button data-guidance="guidance-filters" onClick={() => { markFiltersOpened(); setShowMobileFilters(!showMobileFilters); }} className="ml-auto px-3 py-2 rounded-xl text-xs font-bold bg-white/10 flex items-center gap-1"><SlidersHorizontal className="w-3.5 h-3.5" /> Filters</button>
          </div>

          {showMobileFilters && (
            <div className="mt-2 space-y-2">
              <div className="flex gap-2 flex-wrap">
                <button onClick={() => setFavoritesOnly(!favoritesOnly)} className={`px-2 py-1.5 rounded-lg text-[11px] font-bold ${favoritesOnly ? "bg-yellow-500 text-black" : "bg-white/10 text-white/70"}`}>Favorites</button>
                <button onClick={() => setVerifiedOnly(!verifiedOnly)} className={`px-2 py-1.5 rounded-lg text-[11px] font-bold ${verifiedOnly ? "bg-blue-500 text-white" : "bg-white/10 text-white/70"}`}>Verified</button>
                <button onClick={() => setFreshOnly(!freshOnly)} className={`px-2 py-1.5 rounded-lg text-[11px] font-bold ${freshOnly ? "bg-emerald-500 text-[#052214]" : "bg-white/10 text-white/70"}`}>Fresh</button>
                <button onClick={() => setDecisionMode(!decisionMode)} className={`px-2 py-1.5 rounded-lg text-[11px] font-bold ${decisionMode ? "bg-purple-500 text-white" : "bg-white/10 text-white/70"}`}>Decision</button>
                <button onClick={() => setSortBy(sortBy === "distance" ? "price" : "distance")} className="px-2 py-1.5 rounded-lg text-[11px] font-bold bg-white/10 text-white/70">{sortBy === "distance" ? "Nearest" : "Cheapest"}</button>
              </div>
              <div className="flex gap-1.5 overflow-x-auto hide-scrollbar">{BRANDS.map((brand) => <button key={brand} onClick={() => setBrandFilter(brand)} className={`px-3 py-1.5 rounded-lg whitespace-nowrap text-[11px] font-bold ${brandFilter === brand ? "bg-[#FF6200]" : "bg-white/10 text-white/70"}`}>{brand}</button>)}</div>
            </div>
          )}
        </div>

        <div className="px-3 pt-3 pb-20 overflow-y-auto hide-scrollbar space-y-2">
          <div className="grid grid-cols-3 gap-2">{loading && bestNowStations.length === 0 ? Array.from({ length: 3 }).map((_, index) => <div key={`mobile-best-skeleton-${index}`} className="skeleton-card rounded-xl bg-white/8 border border-white/10 p-2"><div className="skeleton-block h-2.5 w-16 rounded" /><div className="skeleton-block h-4 w-12 mt-2 rounded" /><div className="skeleton-block h-2.5 w-10 mt-2 rounded" /></div>) : bestNowStations.map((station) => { const price = activeFuelType === "diesel" ? station.diesel_price : station.petrol_price; const trust = getStationTrust(station); return <button key={`mobile-best-${station.id}`} onClick={() => onSelectStation(station)} className="text-left rounded-xl bg-white/8 border border-white/10 p-2"><p className="text-[11px] font-bold truncate">{station.name}</p><p className={`text-sm font-black mt-1 ${activeFuelType === "diesel" ? "text-[#FF6200]" : "text-blue-400"}`}>{price ? `R${price.toFixed(2)}` : "--"}</p><p className={`text-[10px] mt-1 font-bold ${trust.tier === "high" ? "text-emerald-400" : trust.tier === "medium" ? "text-amber-400" : "text-red-400"}`}>Trust {trust.score}</p></button>; })}</div>
          {(loading && listStations.length === 0 ? Array.from({ length: 5 }).map((_, index) => <div key={`mobile-list-skeleton-${index}`} className="skeleton-card rounded-xl border border-white/10 bg-white/6 p-3"><div className="flex justify-between gap-3"><div className="flex-1"><div className="skeleton-block h-3 w-28 rounded" /><div className="skeleton-block h-2.5 w-40 mt-2 rounded" /></div><div className="skeleton-block h-5 w-14 rounded" /></div><div className="skeleton-block mt-2 h-7 rounded-lg" /><div className="mt-2 flex gap-1.5"><div className="skeleton-block h-5 w-16 rounded" /><div className="skeleton-block h-5 w-20 rounded" /></div></div>) : listStations.map((station) => {
            const price = activeFuelType === "diesel" ? station.diesel_price : station.petrol_price;
            const isSelected = station.id && selectedStation?.id === station.id;
            const isStale = Date.now() - station.last_updated > 7 * 24 * 60 * 60 * 1000;
            const trust = getStationTrust(station);
            const breakdown = getTrustBreakdown(station);

            return <div id={`station-card-${station.id}`} key={`mobile-${station.id}`} className={`rounded-xl border p-3 ${isSelected ? "bg-emerald-500/12 border-emerald-400/50" : "bg-white/6 border-white/10"}`} onClick={() => onSelectStation(station)}><div className="flex justify-between gap-3"><div className="min-w-0"><p className="font-bold text-sm truncate">{station.name}</p><p className="text-[11px] text-white/45 truncate mt-0.5">{station.address}</p><p className="text-[10px] text-white/45 mt-1 flex items-center gap-2"><span>{station.distance !== undefined ? `${station.distance.toFixed(1)} km` : "National"}</span><span>·</span><span>{formatRelativeTime(station.last_updated)}</span>{isStale ? <ShieldAlert className="w-3 h-3 text-amber-500" /> : <CheckCircle2 className="w-3 h-3 text-emerald-400" />}</p></div><p className={`text-lg font-black ${activeFuelType === "diesel" ? "text-[#FF6200]" : "text-blue-400"}`}>{price ? `R${price.toFixed(2)}` : "--"}</p></div>
              <div className="mt-2 rounded-lg bg-white/5 px-2.5 py-2">
                <p className={`text-[10px] font-bold ${trust.tier === "high" ? "text-emerald-400" : trust.tier === "medium" ? "text-amber-400" : "text-red-400"}`}>Trust {trust.score} · {breakdown.map((item) => `${Math.round(item.weight * 100)}% ${item.label.split(" ")[0]}`).join(" · ")}</p>
              </div>
              <div className="mt-2 flex gap-1.5 flex-wrap"><a href={`https://www.google.com/maps/dir/?api=1&destination=${station.lat},${station.lng}`} target="_blank" rel="noreferrer" className="px-2 py-1 rounded-md bg-blue-500/15 text-blue-400 text-[10px] font-bold">Navigate</a><button data-guidance="guidance-trend" onClick={(e) => { e.stopPropagation(); onOpenDetails(station); }} className="px-2 py-1 rounded-md bg-white/10 text-white/70 text-[10px] font-bold">More details</button><button onClick={(e) => { e.stopPropagation(); onOpenReport(station); }} className="px-2 py-1 rounded-md bg-[#FF6200]/20 text-[#FF8A45] text-[10px] font-bold">Report</button></div></div>;
          }))}

          <div className="grid grid-cols-2 gap-2 pt-1">
            <button onClick={onLocateUser} className="py-2.5 rounded-xl bg-white/10 text-xs font-bold flex items-center justify-center gap-2"><LocateFixed className="w-4 h-4 text-[#FF6200]" /> Locate me</button>
            <button onClick={onShare} className="py-2.5 rounded-xl bg-white/10 text-xs font-bold flex items-center justify-center gap-2"><Share2 className="w-4 h-4" /> Share</button>
          </div>

          <button onClick={() => setShowInsights((prev) => !prev)} className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-left text-xs font-bold flex items-center justify-between">
            Trust + community insights
            <ChevronDown className={`w-4 h-4 transition-transform ${showInsights ? "rotate-180" : ""}`} />
          </button>

          {showInsights && (
            <>
              <div className="rounded-xl bg-white/5 border border-white/10 p-3 text-xs"><p className="uppercase tracking-widest text-white/45 font-bold">Smart fill</p><p className="text-sm font-black mt-1">{fillRecommendation.title}</p><p className="text-[11px] text-white/60 mt-1">{fillRecommendation.detail}</p></div>
              <div className="rounded-xl bg-white/5 border border-white/10 p-3 text-xs"><p className="uppercase tracking-widest text-white/45 font-bold">Community insights</p><p className="text-[11px] text-white/50 mt-1">Potential savings uses the 24h median report price (more conservative than outlier-based comparisons).</p><div className="mt-2 grid grid-cols-3 gap-2 text-center"><div><p className="text-lg font-black text-[#FF6200]">R{communityStats.savedRand.toLocaleString()}</p><p className="text-[10px] text-white/45 uppercase">Potential</p></div><div><p className="text-lg font-black">{communityStats.reports24h}</p><p className="text-[10px] text-white/45 uppercase">24h reports</p></div><div><p className="text-lg font-black">{listStations.length + bestNowStations.length}</p><p className="text-[10px] text-white/45 uppercase">Visible</p></div></div></div>
            </>
          )}
          {visits === 0 && <div className="rounded-xl bg-[#FF6200]/15 border border-[#FF6200]/30 p-3 text-center"><p className="text-sm font-black">First time here?</p><p className="text-xs text-white/70 mt-1">Tap report to help the community with fresh prices.</p></div>}
        </div>
      </section>
    </>
  );
}
