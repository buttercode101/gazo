import { MapContainer, TileLayer, Marker, Popup, useMap, useMapEvents } from 'react-leaflet';
import MarkerClusterGroup from 'react-leaflet-cluster';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { Station } from '../types';
import { Button } from './ui/button';
import { Navigation, Clock, Droplet } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { triggerHaptic } from '../lib/seedData';
import { getStationTrust, getTrustBreakdown } from '../lib/trust';

// Create a custom divIcon for pins
const createCustomIcon = (type: 'diesel' | 'petrol', price: number | null, name: string, isHighlighted?: boolean, isStale?: boolean) => {
  const brandColor = type === 'diesel' ? '#FF6200' : '#3B82F6';
  const colorId = isStale ? '#858585' : brandColor; // Gray out physically stale marks
  const label = price ? `R ${price.toFixed(2)}` : '???';
  const width = Math.max(76, Math.min(128, label.length * 12 + 28));
  const ringClass = isHighlighted ? 'ring-4 ring-emerald-500 animate-pulse z-50' : '';
  const opacityClass = isStale ? 'opacity-80 grayscale-[0.5]' : 'opacity-100';
  
  const html = `
    <div class="group relative flex flex-col items-center ${opacityClass}" style="z-index: ${isHighlighted ? 9999 : 1}">
      <div class="bg-[${colorId}] px-3 py-1.5 rounded-full flex items-center gap-2 shadow-[0_12px_24px_rgba(0,0,0,0.35)] border-2 border-white/25 ${ringClass}">
        <span class="text-xs font-black text-white ${isStale ? 'text-white/80' : ''}">${label}</span>
        <div class="w-1.5 h-1.5 bg-white rounded-full ${(!isStale && type === 'diesel') ? 'animate-pulse' : ''}"></div>
      </div>
      <div class="w-0.5 h-4 bg-[${colorId}] mx-auto opacity-50"></div>
      <p class="text-[10px] font-bold text-center mt-1 uppercase tracking-wider text-white/70 drop-shadow-md whitespace-nowrap">${name}</p>
    </div>
  `;

  return L.divIcon({
    html,
    className: 'custom-leaflet-icon bg-transparent border-none',
    iconSize: [width, 50],
    iconAnchor: [Math.floor(width / 2), 50], // Base of the line
    popupAnchor: [0, -50],
  });
};

function MapUpdater({ center, zoom }: { center: [number, number] | null; zoom: number }) {
  const map = useMap();
  useEffect(() => {
    if (center) {
      map.flyTo(center, zoom, { duration: 1.5 });
    }
  }, [center, zoom, map]);
  return null;
}

function MapInteractionHandler({ onLongPress }: { onLongPress?: (latLng: [number, number]) => void }) {
  useMapEvents({
    contextmenu: (e) => {
      if (Number.isFinite(e.latlng.lat) && Number.isFinite(e.latlng.lng)) {
        onLongPress?.([e.latlng.lat, e.latlng.lng]);
      }
    }
  });
  return null;
}

interface MapProps {
  stations: Station[];
  userLocation: [number, number] | null;
  activeFuelType: 'diesel' | 'petrol';
  onReportClick: (station?: Station) => void;
  onStationSelect?: (station: Station) => void;
  onLocationReport?: (latLng: [number, number]) => void;
  recentReportId?: string | null;
  onMapReady?: () => void;
}

export function MapView({ stations, userLocation, activeFuelType, onReportClick, onStationSelect, onLocationReport, recentReportId, onMapReady }: MapProps) {
  const defaultCenter: [number, number] = [-28.4793, 24.6727]; // South Africa center
  const defaultZoom = 6;
  const safeStations = stations.filter((station) => Number.isFinite(station.lat) && Number.isFinite(station.lng));
  const safeUserLocation = userLocation && Number.isFinite(userLocation[0]) && Number.isFinite(userLocation[1]) ? userLocation : null;
  const readyNotifiedRef = useRef(false);

  const notifyMapReady = () => {
    if (readyNotifiedRef.current) return;
    readyNotifiedRef.current = true;
    onMapReady?.();
  };

  return (
    <div className="h-full w-full relative">
      <MapContainer
        center={defaultCenter}
        zoom={defaultZoom}
        className="h-full w-full map-surface"
        zoomControl={false}
      >
        <TileLayer
          url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'
          eventHandlers={{ load: notifyMapReady }}
        />
        
        <MapUpdater center={safeUserLocation} zoom={safeUserLocation ? 14 : defaultZoom} />
        <MapInteractionHandler onLongPress={onLocationReport} />

        {safeUserLocation && (
          <Marker
            position={safeUserLocation}
            icon={L.divIcon({
              html: `<div class="w-4 h-4 bg-blue-500 rounded-full border-2 border-white shadow-[0_0_15px_rgba(59,130,246,0.8)] animate-pulse"></div>`,
              className: 'bg-transparent',
            })}
          />
        )}

        <MarkerClusterGroup
          chunkedLoading
          maxClusterRadius={40}
          showCoverageOnHover={false}
        >
          {safeStations.map((station) => {
          const price = activeFuelType === 'diesel' ? station.diesel_price : station.petrol_price;
          const isHighlighted = station.id === recentReportId;
          const isStale = Date.now() - station.last_updated > 7 * 24 * 60 * 60 * 1000;
          const trust = getStationTrust(station);
          
          return (
            <Marker
              key={station.id}
              position={[station.lat, station.lng]}
              icon={createCustomIcon(activeFuelType, price, station.name, isHighlighted, isStale)}
              eventHandlers={{
                click: () => onStationSelect?.(station)
              }}
            >
              <Popup className="custom-popup">
                <div className="p-1 min-w-[200px] max-w-[240px]">
                  <h3 className="font-semibold text-base mb-1 truncate text-white">{station.name}</h3>
                  <div className="flex gap-3 mb-2 flex-wrap">
                    <div className="flex items-center text-sm">
                      <Droplet className="w-3.5 h-3.5 mr-1 text-[#FF6200]" />
                      <span className="font-mono">{station.diesel_price ? `R${station.diesel_price.toFixed(2)}` : '--'}</span>
                    </div>
                    <div className="flex items-center text-sm">
                      <Droplet className="w-3.5 h-3.5 mr-1 text-blue-500" />
                      <span className="font-mono">{station.petrol_price ? `R${station.petrol_price.toFixed(2)}` : '--'}</span>
                    </div>
                  </div>
                  <div className={`flex items-center text-xs mb-2 ${isStale ? 'text-amber-500 font-bold' : 'text-muted-foreground'}`}>
                    <Clock className="w-3 h-3 mr-1" />
                    {isStale ? 'Price may be outdated' : `Updated ${formatDistanceToNow(station.last_updated, { addSuffix: true })}`}
                  </div>
                  <div className="mb-3 space-y-1">
                    <span
                      className={`inline-flex items-center rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider ${
                        trust.tier === 'high'
                          ? 'bg-emerald-500/20 text-emerald-400'
                          : trust.tier === 'medium'
                            ? 'bg-amber-500/20 text-amber-400'
                            : 'bg-red-500/20 text-red-400'
                      }`}
                    >
                      {trust.label} · {trust.score}
                    </span>
                    <p className="text-[10px] text-white/60">
                      {getTrustBreakdown(station).map((item) => `${Math.round(item.weight * 100)}% ${item.label}`).join(' · ')}
                    </p>
                  </div>

                  <div className="flex gap-2 w-full">
                    <a 
                      href={`https://www.google.com/maps/dir/?api=1&destination=${station.lat},${station.lng}`} 
                      target="_blank" 
                      rel="noreferrer"
                      onClick={() => triggerHaptic()}
                      className="flex-1 bg-[#FF6200] hover:bg-[#E65800] text-white transition-colors py-2 rounded-md font-bold text-sm flex items-center justify-center border-none"
                    >
                      <Navigation className="w-4 h-4 mr-2" /> Navigate
                    </a>
                    <Button
                      className="bg-white/10 hover:bg-white/20 text-white border border-white/10"
                      size="sm"
                      onClick={() => onStationSelect?.(station)}
                    >
                      More
                    </Button>
                  </div>
                </div>
              </Popup>
            </Marker>
          );
        })}
        </MarkerClusterGroup>
      </MapContainer>
    </div>
  );
}
