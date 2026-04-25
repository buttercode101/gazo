import { Navigation, Star, TrendingUp } from "lucide-react";
import { Station } from "../types";
import { getStationTrust } from "../lib/trust";

const BRANDS = ["All", "Engen", "Sasol", "Shell", "BP", "Astron Energy", "TotalEnergies", "Independent"];

type Props = {
  loading: boolean;
  activeFuelType: "diesel" | "petrol";
  browseScope: "nearby" | "south_africa";
  setBrowseScope: (scope: "nearby" | "south_africa") => void;
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
  fillRecommendation: { title: string; detail: string };
  bestNowStations: Station[];
  listStations: Station[];
  selectedStation: Station | null;
  favorites: string[];
  avgPrice: number;
  tankSize: number;
  communitySavedRand: number;
  onOpenReport: (station?: Station) => void;
  onSelectStation: (station: Station) => void;
  onOpenDetails: (station: Station) => void;
  onToggleFavorite: (stationId?: string) => void;
  formatRelativeTime: (timestamp: number) => string;
  markFiltersOpened: () => void;
};

export function DesktopRail(props: Props) {
  const {
    loading,
    activeFuelType,
    browseScope,
    setBrowseScope,
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
    fillRecommendation,
    bestNowStations,
    listStations,
    selectedStation,
    favorites,
    avgPrice,
    tankSize,
    communitySavedRand,
    onOpenReport,
    onSelectStation,
    onOpenDetails,
    onToggleFavorite,
    formatRelativeTime,
    markFiltersOpened,
  } = props;

  return (
    <div className="hidden lg:block absolute top-24 left-5 bottom-5 w-[min(32vw,460px)] z-40">
      <section className="h-full rounded-[28px] border border-white/10 bg-[#0D1421]/94 backdrop-blur-2xl shadow-[0_22px_52px_rgba(0,0,0,0.45)] flex flex-col overflow-hidden">
        <div className="px-5 pt-5 pb-4 border-b border-white/10">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[10px] uppercase tracking-[0.22em] text-white/45 font-bold">Best right now</p>
              <h2 className="text-lg font-black mt-1">Live fuel board</h2>
            </div>
            <button data-guidance="guidance-report" onClick={() => onOpenReport()} className="px-3 py-2 rounded-xl bg-[#FF6200] hover:bg-[#E65800] text-xs font-black">Report Price</button>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-2">
            <button onClick={() => setBrowseScope("nearby")} className={`px-3 py-2 rounded-xl text-xs font-bold ${browseScope === "nearby" ? "bg-emerald-500 text-[#052214]" : "bg-white/5 text-white/65 hover:text-white"}`}>Nearby</button>
            <button onClick={() => setBrowseScope("south_africa")} className={`px-3 py-2 rounded-xl text-xs font-bold ${browseScope === "south_africa" ? "bg-emerald-500 text-[#052214]" : "bg-white/5 text-white/65 hover:text-white"}`}>South Africa</button>
          </div>

          <div data-guidance="guidance-filters" className="mt-3 flex flex-wrap gap-2">
            <button onClick={() => { markFiltersOpened(); setFavoritesOnly(!favoritesOnly); }} className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold ${favoritesOnly ? "bg-yellow-500 text-black" : "bg-white/5 text-white/70"}`}>Favorites</button>
            <button onClick={() => { markFiltersOpened(); setVerifiedOnly(!verifiedOnly); }} className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold ${verifiedOnly ? "bg-blue-500 text-white" : "bg-white/5 text-white/70"}`}>Verified</button>
            <button onClick={() => { markFiltersOpened(); setFreshOnly(!freshOnly); }} className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold ${freshOnly ? "bg-emerald-500 text-[#042312]" : "bg-white/5 text-white/70"}`}>Fresh</button>
            <button onClick={() => { markFiltersOpened(); setDecisionMode(!decisionMode); }} className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold ${decisionMode ? "bg-purple-500 text-white" : "bg-white/5 text-white/70"}`}>Decision mode</button>
            <button onClick={() => { markFiltersOpened(); setSortBy(sortBy === "distance" ? "price" : "distance"); }} className="px-2.5 py-1.5 rounded-lg text-[11px] font-bold bg-white/5 text-white/70">{sortBy === "distance" ? "Nearest" : "Cheapest"}</button>
          </div>

          <div className="mt-3 flex gap-2 overflow-x-auto hide-scrollbar">
            {BRANDS.map((brand) => (
              <button key={brand} onClick={() => setBrandFilter(brand)} className={`px-3 py-1.5 rounded-lg whitespace-nowrap text-[11px] font-bold ${brandFilter === brand ? "bg-[#FF6200] text-white" : "bg-white/5 text-white/65"}`}>{brand}</button>
            ))}
          </div>

          <div className="mt-3 rounded-xl border border-white/10 bg-white/5 px-3 py-2.5">
            <p className="text-[10px] uppercase tracking-[0.18em] text-white/45 font-bold">Smart fill decision</p>
            <p className="text-sm font-black mt-1">{fillRecommendation.title}</p>
            <p className="text-[11px] text-white/60 mt-1">{fillRecommendation.detail}</p>
          </div>
        </div>

        <div className="px-4 pt-3 pb-2 space-y-2 border-b border-white/10">
          {loading && bestNowStations.length === 0 ? Array.from({ length: 3 }).map((_, index) => (
            <div key={`best-skeleton-${index}`} className="skeleton-card w-full rounded-xl bg-white/5 border border-white/10 px-3 py-2.5">
              <div className="flex justify-between gap-3 items-start">
                <div className="min-w-0 flex-1">
                  <div className="skeleton-block h-3.5 w-28 rounded" />
                  <div className="skeleton-block mt-2 h-2.5 w-24 rounded" />
                </div>
                <div className="w-16">
                  <div className="skeleton-block h-4 rounded" />
                  <div className="skeleton-block mt-1.5 h-2.5 rounded" />
                </div>
              </div>
            </div>
          )) : bestNowStations.map((station) => {
            const price = activeFuelType === "diesel" ? station.diesel_price : station.petrol_price;
            const isStale = Date.now() - station.last_updated > 7 * 24 * 60 * 60 * 1000;
            const trust = getStationTrust(station);
            return (
              <button key={`best-${station.id}`} onClick={() => onSelectStation(station)} className="w-full rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 px-3 py-2.5 text-left">
                <div className="flex justify-between gap-3 items-start">
                  <div className="min-w-0">
                    <p className="font-bold truncate">{station.name}</p>
                    <p className="text-[11px] text-white/55 mt-0.5 flex items-center gap-2">{station.distance !== undefined ? `${station.distance.toFixed(1)} km` : "National"}<span>·</span><span>{formatRelativeTime(station.last_updated)}</span></p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className={`text-base font-black ${activeFuelType === "diesel" ? "text-[#FF6200]" : "text-blue-500"}`}>{price ? `R ${price.toFixed(2)}` : "--"}</p>
                    <p className={`text-[10px] uppercase font-bold ${isStale ? "text-amber-500" : "text-emerald-400"}`}>{isStale ? "Stale" : "Fresh"}</p>
                    <p className={`text-[10px] font-bold mt-1 ${trust.tier === "high" ? "text-emerald-400" : trust.tier === "medium" ? "text-amber-400" : "text-red-400"}`}>Trust {trust.score}</p>
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        <div className="flex-1 overflow-y-auto px-4 pt-3 pb-4 space-y-2 hide-scrollbar">
          {loading && listStations.length === 0 ? Array.from({ length: 5 }).map((_, index) => (
            <div key={`list-skeleton-${index}`} className="skeleton-card rounded-2xl border border-white/10 bg-white/5 px-3.5 py-3">
              <div className="flex justify-between gap-3">
                <div className="flex-1">
                  <div className="skeleton-block h-3.5 w-36 rounded" />
                  <div className="skeleton-block mt-2 h-2.5 w-52 rounded" />
                  <div className="skeleton-block mt-2 h-2.5 w-28 rounded" />
                </div>
                <div className="w-16">
                  <div className="skeleton-block h-5 rounded" />
                  <div className="skeleton-block mt-2 h-2.5 rounded" />
                </div>
              </div>
              <div className="mt-3 flex gap-1.5">
                <div className="skeleton-block h-6 w-12 rounded" />
                <div className="skeleton-block h-6 w-14 rounded" />
                <div className="skeleton-block h-6 w-8 rounded" />
              </div>
            </div>
          )) : listStations.map((station) => {
            const price = activeFuelType === "diesel" ? station.diesel_price : station.petrol_price;
            const savings = price && avgPrice > 0 ? (avgPrice - price) * tankSize : 0;
            const isSelected = station.id && selectedStation?.id === station.id;
            const isFav = station.id && favorites.includes(station.id);
            const isStale = Date.now() - station.last_updated > 7 * 24 * 60 * 60 * 1000;
            const trust = getStationTrust(station);

            return (
              <div id={`station-card-${station.id}`} key={station.id} className={`rounded-2xl border px-3.5 py-3 transition-all ${isSelected ? "bg-emerald-500/12 border-emerald-400/50" : "bg-white/5 border-white/10 hover:bg-white/10"} ${isStale ? "opacity-70" : "opacity-100"}`}>
                <div className="flex justify-between gap-3">
                  <button onClick={() => onSelectStation(station)} className="text-left flex-1 min-w-0">
                    <p className="font-bold truncate">{station.name}</p>
                    <p className="text-[11px] text-white/50 mt-1 truncate">{station.address}</p>
                    <p className="text-[11px] text-white/40 mt-1.5 flex items-center gap-2"><span>{station.distance !== undefined ? `${station.distance.toFixed(1)} km` : "National"}</span><span>·</span><span>{formatRelativeTime(station.last_updated)}</span><span>·</span><span className={trust.tier === "high" ? "text-emerald-400" : trust.tier === "medium" ? "text-amber-400" : "text-red-400"}>Trust {trust.score}</span>{station.latest_image_url && <><span>·</span><span className="text-blue-400">Verified</span></>}</p>
                  </button>
                  <div className="shrink-0 text-right">
                    <p className={`text-lg font-black ${activeFuelType === "diesel" ? "text-[#FF6200]" : "text-blue-500"}`}>{price ? `R ${price.toFixed(2)}` : "--"}</p>
                    {price && avgPrice > 0 && <p className={`text-[10px] font-bold uppercase ${savings > 0 ? "text-emerald-400" : "text-white/35"}`}>{savings > 0 ? `Save R${savings.toFixed(0)}` : "Avg/above"}</p>}
                  </div>
                </div>
                <div className="mt-2.5 flex flex-wrap gap-1.5">
                  <a href={`https://www.google.com/maps/dir/?api=1&destination=${station.lat},${station.lng}`} target="_blank" rel="noreferrer" className="px-2 py-1 rounded-md bg-blue-500/15 text-blue-400 text-[10px] font-bold uppercase tracking-wider flex items-center gap-1"><Navigation className="w-3 h-3" /> Go</a>
                  <button onClick={() => onOpenReport(station)} className="px-2 py-1 rounded-md bg-[#FF6200]/20 text-[#FF8A45] text-[10px] font-bold uppercase tracking-wider">Report</button>
                  <button onClick={() => onToggleFavorite(station.id)} className={`px-2 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider ${isFav ? "bg-yellow-500/20 text-yellow-400" : "bg-white/10 text-white/65"}`}><Star className="w-3 h-3" /></button>
                  <button data-guidance="guidance-trend" onClick={() => onOpenDetails(station)} className="px-2 py-1 rounded-md bg-white/10 text-white/65 text-[10px] font-bold uppercase tracking-wider flex items-center gap-1"><TrendingUp className="w-3 h-3" /> Trend</button>
                </div>
              </div>
            );
          })}
        </div>

        <div className="px-4 py-3 border-t border-white/10 bg-white/5 flex items-center justify-between text-[11px]">
          <span className="text-white/55">{listStations.length + bestNowStations.length} visible stations</span>
          <span className="text-white/45">R {communitySavedRand.toLocaleString()} potential vs median</span>
        </div>
      </section>
    </div>
  );
}
