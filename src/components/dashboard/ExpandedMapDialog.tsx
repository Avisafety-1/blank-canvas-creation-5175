import { useCallback, useEffect, useRef, useState, useMemo } from "react";
import { useAuth } from "@/contexts/AuthContext";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import droneAnimatedIcon from "@/assets/drone-animated.gif";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { FlightAltitudeProfile } from "./FlightAltitudeProfile";
import { fetchTerrainElevations, buildTerrainProfile, downsamplePositions, interpolateElevations, type TerrainPoint } from "@/lib/terrainElevation";
import { renderSoraZones, type SoraSettings } from "@/lib/soraGeometry";
import { SoraSettingsPanel } from "@/components/SoraSettingsPanel";

interface RoutePoint {
  lat: number;
  lng: number;
}

interface RouteData {
  coordinates: RoutePoint[];
  totalDistance: number;
  soraSettings?: SoraSettings;
}

interface FlightTrackPosition {
  lat: number;
  lng: number;
  alt?: number;
  alt_msl?: number;
  alt_agl?: number;
  speed?: number;
  heading?: number;
  vert_speed?: number;
  timestamp?: string;
}

interface FlightTrack {
  positions: FlightTrackPosition[];
  flightLogId?: string;
  flightDate?: string;
}

interface NotamData {
  lat: number;
  lng: number;
  radiusNm: number;
  text: string;
}

interface ExpandedMapDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  latitude: number;
  longitude: number;
  route?: RouteData | null;
  flightTracks?: FlightTrack[] | null;
  missionTitle?: string;
  missionId?: string;
  onSoraUpdated?: () => void;
  notam?: NotamData | null;
}

export const ExpandedMapDialog = ({
  open,
  onOpenChange,
  latitude,
  longitude,
  route,
  flightTracks,
  missionTitle,
  missionId,
  onSoraUpdated,
  notam,
}: ExpandedMapDialogProps) => {
  const { companyId } = useAuth();
  const mapRef = useRef<HTMLDivElement | null>(null);
  const leafletMapRef = useRef<L.Map | null>(null);
  const [mapType, setMapType] = useState<'standard' | 'satellite'>('standard');
  const tileLayerRef = useRef<L.TileLayer | null>(null);
  const [flightStats, setFlightStats] = useState<{ maxAlt: number; maxSpeed: number } | null>(null);
  const [terrainData, setTerrainData] = useState<TerrainPoint[]>([]);
  const highlightMarkerRef = useRef<L.Marker | null>(null);
  const [terrainLoading, setTerrainLoading] = useState(false);
  const [mapReady, setMapReady] = useState(false);
  const terrainElevationsRef = useRef<globalThis.Map<string, number>>(new globalThis.Map());
  const flightTrackLayerRef = useRef<L.LayerGroup | null>(null);
  const soraLayerRef = useRef<L.LayerGroup | null>(null);

  const defaultSora: SoraSettings = { enabled: false, flightAltitude: 120, flightGeographyDistance: 0, contingencyDistance: 50, contingencyHeight: 30, groundRiskDistance: 100, bufferMode: "corridor" };
  const [soraSettings, setSoraSettings] = useState<SoraSettings>(route?.soraSettings ?? defaultSora);

  // Apply company default flight geography
  useEffect(() => {
    if (route?.soraSettings) return; // Don't override saved settings
    if (!companyId) return;
    (supabase as any)
      .from("company_sora_config")
      .select("default_flight_geography_m, default_flight_altitude_m")
      .eq("company_id", companyId)
      .maybeSingle()
      .then(({ data }: any) => {
        if (data?.default_flight_geography_m > 0) {
          setSoraSettings(prev => prev.flightGeographyDistance === 0 ? { ...prev, flightGeographyDistance: data.default_flight_geography_m } : prev);
        }
        if (data?.default_flight_altitude_m != null && data.default_flight_altitude_m > 0) {
          setSoraSettings(prev => prev.flightAltitude === 0 ? { ...prev, flightAltitude: data.default_flight_altitude_m } : prev);
        }
      });
  }, [companyId, route?.soraSettings]);
  const [soraDirty, setSoraDirty] = useState(false);
  const [soraSaving, setSoraSaving] = useState(false);
  const [soraDroneId, setSoraDroneId] = useState<string | null>(route?.soraSettings?.droneId ?? null);

  const handleSoraChange = (newSettings: SoraSettings) => {
    setSoraSettings(newSettings);
    setSoraDirty(true);
  };

  const handleSaveSora = async () => {
    if (!missionId || !route) return;
    setSoraSaving(true);
    const settingsWithDrone = { ...soraSettings, droneId: soraDroneId ?? undefined };
    const updatedRoute = { ...route, soraSettings: settingsWithDrone };
    const { error } = await supabase
      .from("missions")
      .update({ route: updatedRoute as any })
      .eq("id", missionId);

    // Auto-add selected drone to mission_drones
    if (!error && soraDroneId) {
      const { data: existing } = await supabase
        .from("mission_drones")
        .select("id")
        .eq("mission_id", missionId)
        .eq("drone_id", soraDroneId)
        .maybeSingle();
      if (!existing) {
        await supabase.from("mission_drones").insert({ mission_id: missionId, drone_id: soraDroneId } as any);
      }
    }

    setSoraSaving(false);
    if (error) {
      toast.error("Kunne ikke lagre SORA-innstillinger");
    } else {
      toast.success("SORA-innstillinger lagret");
      setSoraDirty(false);
      onSoraUpdated?.();
    }
  };

  // Reset SORA settings when route changes
  useEffect(() => {
    setSoraSettings(route?.soraSettings ?? defaultSora);
    setSoraDroneId(route?.soraSettings?.droneId ?? null);
    setSoraDirty(false);
  }, [route]);

  // Re-render SORA zones when settings change
  useEffect(() => {
    const map = leafletMapRef.current;
    if (!map || !mapReady || !route?.coordinates?.length) return;

    if (soraLayerRef.current) {
      soraLayerRef.current.clearLayers();
    } else {
      soraLayerRef.current = L.layerGroup().addTo(map);
    }

    renderSoraZones(route.coordinates, soraSettings, soraLayerRef.current);
  }, [soraSettings, mapReady, route]);

  // ── Terrain fetch effect (independent of map lifecycle) ──
  useEffect(() => {
    if (!open || !flightTracks || flightTracks.length === 0) return;

    const controller = new AbortController();
    setTerrainLoading(true);

    async function loadTerrain() {
      const sortedTracks = [...flightTracks!].sort((a, b) => {
        const dateA = a.flightDate || a.positions?.[0]?.timestamp || '';
        const dateB = b.flightDate || b.positions?.[0]?.timestamp || '';
        return dateA.localeCompare(dateB);
      });
      const allPositions = sortedTracks.flatMap((t) => t.positions || []);
      if (allPositions.length === 0) { setTerrainLoading(false); return; }

      console.log(`[Terrain] Starting fetch for ${allPositions.length} positions`);

      // Check sessionStorage cache
      const first = allPositions[0];
      const last = allPositions[allPositions.length - 1];
      const cacheKey = `terrain_${first.lat.toFixed(4)}_${first.lng.toFixed(4)}_${last.lat.toFixed(4)}_${last.lng.toFixed(4)}_${allPositions.length}`;
      
      try {
        const cached = sessionStorage.getItem(cacheKey);
        if (cached) {
          console.log(`[Terrain] Cache hit for ${cacheKey}`);
          const cachedElevations: (number | null)[] = JSON.parse(cached);
          if (cachedElevations.length === allPositions.length) {
            const elevMap = new globalThis.Map<string, number>();
            allPositions.forEach((pos, i) => {
              if (cachedElevations[i] != null) {
                elevMap.set(`${pos.lat.toFixed(6)},${pos.lng.toFixed(6)}`, cachedElevations[i]!);
              }
            });
            terrainElevationsRef.current = elevMap;
            const profile = buildTerrainProfile(allPositions, cachedElevations);
            setTerrainData(profile);
            setTerrainLoading(false);
            return;
          }
        }
      } catch {}

      if (controller.signal.aborted) return;

      // Downsample to reduce API calls
      const { sampled, indices } = downsamplePositions(allPositions, 80);
      console.log(`[Terrain] Downsampled ${allPositions.length} -> ${sampled.length} positions`);

      // Single attempt via edge function (which handles retries server-side)
      const sampledResult = await fetchTerrainElevations(sampled, controller.signal);

      if (controller.signal.aborted) return;

      const validCount = sampledResult.filter(e => e != null).length;
      console.log(`[Terrain] Got ${validCount}/${sampledResult.length} valid elevations`);

      if (validCount === 0) {
        console.error("[Terrain] All elevation fetches failed");
        setTerrainLoading(false);
        return;
      }

      // Interpolate back to full length
      const elevations = interpolateElevations(sampledResult, indices, allPositions.length);

      // Save to sessionStorage cache
      try {
        sessionStorage.setItem(cacheKey, JSON.stringify(elevations));
        console.log(`[Terrain] Cached elevations under ${cacheKey}`);
      } catch {}

      // Store in ref for popup access
      const elevMap = new globalThis.Map<string, number>();
      allPositions.forEach((pos, i) => {
        if (elevations[i] != null) {
          elevMap.set(`${pos.lat.toFixed(6)},${pos.lng.toFixed(6)}`, elevations[i]!);
        }
      });
      terrainElevationsRef.current = elevMap;

      const profile = buildTerrainProfile(allPositions, elevations);
      setTerrainData(profile);
      setTerrainLoading(false);
      console.log(`[Terrain] Profile built with ${profile.length} points`);
    }

    loadTerrain();
    return () => { controller.abort(); };
  }, [open, flightTracks]);

  // ── Map init effect (base layers, markers, route only) ──
  useEffect(() => {
    if (!open || !latitude || !longitude) return;

    console.log("[ExpandedMap] Init effect running:", { latitude, longitude, hasRoute: !!route });

    let cancelled = false;
    let retryCount = 0;
    const maxRetries = 10;
    const timeouts: ReturnType<typeof setTimeout>[] = [];

    function tryInitMap() {
      if (cancelled) return;

      const container = mapRef.current;
      if (!container) {
        if (retryCount < maxRetries) {
          retryCount++;
          timeouts.push(setTimeout(tryInitMap, 100));
        }
        return;
      }

      if (container.offsetWidth === 0 || container.offsetHeight === 0) {
        if (retryCount < maxRetries) {
          retryCount++;
          timeouts.push(setTimeout(tryInitMap, 100));
        }
        return;
      }

      // Clean up any existing map
      if (leafletMapRef.current) {
        try { leafletMapRef.current.remove(); } catch {}
        leafletMapRef.current = null;
      }

      try {
        const map = L.map(container, {
          zoomControl: true,
          scrollWheelZoom: true,
        }).setView([latitude, longitude], 13);

        leafletMapRef.current = map;
        setMapReady(true);

        const tileLayer = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
          attribution: "&copy; OpenStreetMap contributors",
        }).addTo(map);
        tileLayerRef.current = tileLayer;

        // Mission marker
        const icon = L.divIcon({
          className: "",
          html: `<div style="
            width: 40px;
            height: 40px;
            display: flex;
            align-items: center;
            justify-content: center;
            filter: drop-shadow(0 2px 4px rgba(0,0,0,0.4));
          ">
            <svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/>
              <circle cx="12" cy="10" r="3" fill="#3b82f6"/>
            </svg>
          </div>`,
          iconSize: [40, 40],
          iconAnchor: [20, 40],
        });

        L.marker([latitude, longitude], { icon })
          .addTo(map)
          .bindPopup("Oppdragsposisjon");

        const allPoints: [number, number][] = [[latitude, longitude]];

        // Planned route (blue dashed)
        if (route?.coordinates && route.coordinates.length > 0) {
          const routeLayer = L.layerGroup().addTo(map);

          if (route.coordinates.length > 1) {
            const latLngs = route.coordinates.map(
              (p) => [p.lat, p.lng] as [number, number]
            );
            L.polyline(latLngs, {
              color: "#3b82f6",
              weight: 4,
              opacity: 0.8,
              dashArray: "10, 5",
            }).addTo(routeLayer);

            latLngs.forEach((ll) => allPoints.push(ll));
          }

          route.coordinates.forEach((point, index) => {
            const isFirst = index === 0;
            const isLast = index === route.coordinates.length - 1 && route.coordinates.length > 1;

            let bgColor = "#3b82f6";
            if (isFirst) bgColor = "#22c55e";
            else if (isLast) bgColor = "#ef4444";

            L.marker([point.lat, point.lng], {
              icon: L.divIcon({
                className: "",
                html: `<div style="
                  width: 28px;
                  height: 28px;
                  background: ${bgColor};
                  border: 2px solid white;
                  border-radius: 50%;
                  display: flex;
                  align-items: center;
                  justify-content: center;
                  color: white;
                  font-weight: bold;
                  font-size: 12px;
                  box-shadow: 0 2px 6px rgba(0,0,0,0.3);
                ">${index + 1}</div>`,
                iconSize: [28, 28],
                iconAnchor: [14, 14],
              }),
            }).addTo(routeLayer).bindPopup(`Rutepunkt ${index + 1}`);
          });
        }

        // Include flight track positions in bounds calculation
        if (flightTracks && flightTracks.length > 0) {
          flightTracks.forEach(track => {
            if (track.positions) {
              track.positions.forEach(pos => {
                allPoints.push([pos.lat, pos.lng]);
              });
            }
          });
        }

        // NOTAM circle
        if (notam && notam.lat && notam.lng && notam.radiusNm > 0) {
          const radiusMeters = notam.radiusNm * 1852;
          const notamCircle = L.circle([notam.lat, notam.lng], {
            radius: radiusMeters,
            color: '#f59e0b',
            weight: 2,
            fillColor: '#f59e0b',
            fillOpacity: 0.1,
            dashArray: '6, 4',
          }).addTo(map);
          notamCircle.bindPopup(`<div style="font-size:12px;max-width:300px;white-space:pre-wrap;font-family:monospace;"><strong>NOTAM</strong><hr style="margin:4px 0"/>${notam.text}</div>`);
          const cb = notamCircle.getBounds();
          allPoints.push([cb.getSouthWest().lat, cb.getSouthWest().lng]);
          allPoints.push([cb.getNorthEast().lat, cb.getNorthEast().lng]);
        }

        if (allPoints.length > 1) {
          const bounds = L.latLngBounds(allPoints);
          map.fitBounds(bounds, { padding: [50, 50], maxZoom: 18 });
        }

        // Fetch airspace zones
        const zonesLayer = L.layerGroup().addTo(map);
        fetchZones(zonesLayer, map);

        // Force size recalculation
        [300, 500, 800].forEach((d) => {
          timeouts.push(setTimeout(() => {
            if (!cancelled && leafletMapRef.current) {
              leafletMapRef.current.invalidateSize();
            }
          }, d));
        });
      } catch (err) {
        console.error("Error initializing map:", err);
      }
    }

    timeouts.push(setTimeout(tryInitMap, 150));

    return () => {
      cancelled = true;
      timeouts.forEach(clearTimeout);
    };
  }, [open, latitude, longitude, route]);

  // ── Cleanup map on dialog close ──
  useEffect(() => {
    if (!open) {
      if (leafletMapRef.current) {
        try { leafletMapRef.current.remove(); } catch {}
        leafletMapRef.current = null;
      }
      flightTrackLayerRef.current = null;
      soraLayerRef.current = null;
      setTerrainData([]);
      setFlightStats(null);
      setTerrainLoading(false);
      setMapReady(false);
      terrainElevationsRef.current = new globalThis.Map();
    }
  }, [open]);

  // ── Flight track rendering effect (separate from map init) ──
  useEffect(() => {
    const map = leafletMapRef.current;
    if (!map || !open || !mapReady) return;

    // Remove previous flight track layer
    if (flightTrackLayerRef.current) {
      map.removeLayer(flightTrackLayerRef.current);
      flightTrackLayerRef.current = null;
    }

    if (!flightTracks || flightTracks.length === 0) {
      setFlightStats(null);
      return;
    }

    // Ensure pane exists
    if (!map.getPane('flightTrackPane')) {
      map.createPane('flightTrackPane');
      map.getPane('flightTrackPane')!.style.zIndex = '700';
      map.getPane('popupPane')!.style.zIndex = '800';
    }

    const tracksLayer = L.layerGroup().addTo(map);
    flightTrackLayerRef.current = tracksLayer;

    let maxAlt = 0;
    let maxSpeed = 0;

    flightTracks.forEach((track, trackIndex) => {
      if (!track.positions || track.positions.length < 2) return;

      const altitudes = track.positions
        .map(p => p.alt_msl ?? p.alt ?? null)
        .filter((a): a is number => a != null);
      const minTrackAlt = altitudes.length > 0 ? Math.min(...altitudes) : 0;
      const maxTrackAlt = altitudes.length > 0 ? Math.max(...altitudes) : 0;
      const altRange = maxTrackAlt - minTrackAlt || 1;

      if (maxTrackAlt > maxAlt) maxAlt = maxTrackAlt;
      track.positions.forEach(p => {
        if (p.speed != null && p.speed > maxSpeed) maxSpeed = p.speed;
      });

      const segmentGroup = L.featureGroup().addTo(tracksLayer);
      for (let i = 0; i < track.positions.length - 1; i++) {
        const p1 = track.positions[i];
        const p2 = track.positions[i + 1];
        const alt1 = p1.alt_msl ?? p1.alt ?? minTrackAlt;
        const ratio = (alt1 - minTrackAlt) / altRange;
        const hue = Math.round(120 * (1 - ratio));
        const color = `hsl(${hue}, 80%, 45%)`;
        L.polyline([[p1.lat, p1.lng], [p2.lat, p2.lng]], {
          color,
          weight: 6,
          opacity: 0.9,
          pane: 'flightTrackPane',
        }).addTo(segmentGroup);
      }

      segmentGroup.on('click', (e: L.LeafletMouseEvent) => {
        const clickLatLng = e.latlng;
        let nearestIdx = 0;
        let minDist = Infinity;
        track.positions.forEach((pos, idx) => {
          const dist = clickLatLng.distanceTo(L.latLng(pos.lat, pos.lng));
          if (dist < minDist) { minDist = dist; nearestIdx = idx; }
        });
        const pos = track.positions[nearestIdx];
        const altitude = pos.alt_msl ?? pos.alt ?? null;
        const terrainKey = `${pos.lat.toFixed(6)},${pos.lng.toFixed(6)}`;
        const terrainElev = terrainElevationsRef.current.get(terrainKey);
        const aglValue = altitude != null && terrainElev != null ? altitude - terrainElev : null;
        const content = `
          <div style="font-size:12px;line-height:1.6">
            <strong>Punkt ${nearestIdx + 1} av ${track.positions.length}</strong><hr style="margin:4px 0"/>
            ${altitude != null ? `Høyde (MSL): ${Math.round(altitude)} m<br/>` : ''}
            ${aglValue != null ? `<strong>Høyde (AGL): ${Math.round(aglValue)} m</strong><br/>` : ''}
            ${terrainElev != null ? `Terreng: ${Math.round(terrainElev)} m<br/>` : ''}
            ${pos.speed != null ? `Hastighet: ${pos.speed.toFixed(1)} m/s<br/>` : ''}
            ${pos.heading != null ? `Retning: ${Math.round(pos.heading)}°<br/>` : ''}
            ${pos.vert_speed != null ? `Vert. hast.: ${pos.vert_speed.toFixed(1)} m/s<br/>` : ''}
            ${pos.timestamp ? `Tid: ${new Date(pos.timestamp).toLocaleTimeString('nb-NO')}` : ''}
          </div>`;
        L.popup().setLatLng([pos.lat, pos.lng]).setContent(content).openOn(map);
      });

      // Start marker
      const startPos = track.positions[0];
      L.circleMarker([startPos.lat, startPos.lng], {
        radius: 10,
        fillColor: "#22c55e",
        color: "#fff",
        weight: 2,
        fillOpacity: 1,
        pane: 'flightTrackPane',
      }).addTo(tracksLayer).bindPopup(
        `<strong>Flytur ${trackIndex + 1} - Start</strong>${track.flightDate ? `<br/>${track.flightDate}` : ""}`
      );

      // End marker
      const endPos = track.positions[track.positions.length - 1];
      L.circleMarker([endPos.lat, endPos.lng], {
        radius: 10,
        fillColor: "#f97316",
        color: "#fff",
        weight: 2,
        fillOpacity: 1,
        pane: 'flightTrackPane',
      }).addTo(tracksLayer).bindPopup(`<strong>Flytur ${trackIndex + 1} - Slutt</strong>`);
    });

    if (maxAlt > 0 || maxSpeed > 0) {
      setFlightStats({ maxAlt, maxSpeed });
    }
  }, [open, mapReady, flightTracks, terrainData]);

  // Compute AGL stats
  const aglValues = terrainData.filter((d) => d.agl != null).map((d) => d.agl!);
  const maxAgl = aglValues.length > 0 ? Math.max(...aglValues) : null;
  const avgAgl = aglValues.length > 0 ? aglValues.reduce((a, b) => a + b, 0) / aglValues.length : null;

  const hasFlightTracks = flightTracks && flightTracks.length > 0 && flightTracks.some(t => t.positions?.length >= 2);

  // Handle hover on altitude profile
  const handleProfileHover = useCallback((index: number | null) => {
    const map = leafletMapRef.current;
    if (!map) return;

    if (highlightMarkerRef.current) {
      highlightMarkerRef.current.remove();
      highlightMarkerRef.current = null;
    }

    if (index == null || !terrainData[index]) return;

    const point = terrainData[index];
    const heading = (point as any).heading;
    const rotateStyle = typeof heading === 'number' ? `transform:rotate(${heading}deg);` : '';
    const droneHighlightIcon = L.divIcon({
      className: '',
      html: `<img src="${droneAnimatedIcon}" style="width:48px;height:48px;${rotateStyle}" />`,
      iconSize: [48, 48],
      iconAnchor: [24, 24],
    });
    highlightMarkerRef.current = L.marker([point.lat, point.lng], {
      icon: droneHighlightIcon,
      pane: "popupPane",
    }).addTo(map);
  }, [terrainData]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-4xl w-full sm:w-[95vw] h-screen sm:h-[90vh] flex flex-col p-0 rounded-none sm:rounded-lg"
        aria-describedby={undefined}
      >
        <DialogHeader className="px-3 py-2 pt-[max(0.5rem,env(safe-area-inset-top,0.5rem))]">
          <DialogTitle>{missionTitle || "Oppdragskart"}</DialogTitle>
        </DialogHeader>

        {route?.coordinates && route.coordinates.length >= 3 && (
          <div className="max-h-[40vh] overflow-y-auto border-b border-border">
            <SoraSettingsPanel
              settings={soraSettings}
              onChange={handleSoraChange}
              onDroneSelected={setSoraDroneId}
              initialDroneId={route?.soraSettings?.droneId}
            />
            {soraDirty && missionId && (
              <div className="px-3 pb-2 sm:px-4 sticky bottom-0 bg-background">
                <button
                  onClick={handleSaveSora}
                  disabled={soraSaving}
                  className="w-full py-1.5 px-3 text-sm font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
                >
                  {soraSaving ? "Lagrer…" : "Lagre SORA-innstillinger"}
                </button>
              </div>
            )}
          </div>
        )}

        <div className="flex-1 relative overflow-hidden min-h-0">
          <div ref={mapRef} className="absolute inset-0" />
          <button
            onClick={() => {
              const map = leafletMapRef.current;
              if (!map || !tileLayerRef.current) return;
              const newType = mapType === 'standard' ? 'satellite' : 'standard';
              setMapType(newType);
              map.removeLayer(tileLayerRef.current);
              const url = newType === 'satellite'
                ? 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'
                : 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
              const attr = newType === 'satellite'
                ? '&copy; Esri'
                : '&copy; OpenStreetMap contributors';
              tileLayerRef.current = L.tileLayer(url, { attribution: attr }).addTo(map);
            }}
            className="absolute top-2 right-2 z-[1000] bg-background/80 backdrop-blur-sm border border-border rounded-md p-1.5 shadow-md hover:bg-background transition-colors"
            title={mapType === 'standard' ? 'Satellitt' : 'Standard kart'}
          >
            {mapType === 'standard' ? (
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/><path d="M2 12h20"/></svg>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="18" height="18" x="3" y="3" rx="2"/><path d="M3 9h18"/><path d="M3 15h18"/><path d="M9 3v18"/><path d="M15 3v18"/></svg>
            )}
          </button>
        </div>

        {hasFlightTracks && (
          <div className="px-2 py-1">
            <FlightAltitudeProfile
              data={terrainData}
              loading={terrainLoading}
              onHoverIndex={handleProfileHover}
            />
          </div>
        )}

        <div className="px-2 py-1 flex flex-wrap gap-4 text-xs text-muted-foreground">
          <div className="flex items-center gap-1">
            <div
              className="w-6 h-0.5"
              style={{
                borderStyle: "dashed",
                borderWidth: "1px 0 0",
                borderColor: "#3b82f6",
              }}
            />
            <span>Planlagt rute</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-6 h-0.5" style={{ background: "linear-gradient(90deg, #22c55e, #eab308, #ef4444)" }} />
            <span>Faktisk flytur (farge = høyde)</span>
          </div>
          {flightStats && flightStats.maxAlt > 0 && (
            <>
              <div className="flex items-center gap-1 ml-auto">
                <span>Maks høyde: <strong>{Math.round(flightStats.maxAlt)} m MSL</strong></span>
              </div>
              {flightStats.maxSpeed > 0 && (
                <div className="flex items-center gap-1">
                  <span>Maks hastighet: <strong>{flightStats.maxSpeed.toFixed(1)} m/s</strong></span>
                </div>
              )}
            </>
          )}
          {maxAgl != null && (
            <>
              <div className="flex items-center gap-1">
                <span>Maks AGL: <strong>{Math.round(maxAgl)} m</strong></span>
              </div>
              {avgAgl != null && (
                <div className="flex items-center gap-1">
                  <span>Snitt AGL: <strong>{Math.round(avgAgl)} m</strong></span>
                </div>
              )}
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

// ── Airspace zone fetching (extracted for clarity) ──
async function fetchZones(zonesLayer: L.LayerGroup, map: L.Map) {
  try {
    // NSM zones (red)
    const nsmResponse = await fetch(
      "https://services9.arcgis.com/qCxEdsGu1A7NwfY1/ArcGIS/rest/services/Forbudsomr%c3%a5derNSM_v/FeatureServer/0/query?where=1%3D1&outFields=*&outSR=4326&f=geojson"
    );
    if (nsmResponse.ok) {
      const nsmData = await nsmResponse.json();
      L.geoJSON(nsmData, {
        style: { color: "#ef4444", weight: 2, fillColor: "#ef4444", fillOpacity: 0.15 },
        onEachFeature: (feature, layer) => {
          const name = feature.properties?.navn || feature.properties?.name || "NSM Forbudsområde";
          layer.bindPopup(`<strong>NSM</strong><br/>${name}`);
        },
      }).addTo(zonesLayer);
    }

    // RPAS 5km zones (orange)
    const rpasResponse = await fetch(
      "https://services.arcgis.com/a8CwScMFSS2ljjgn/ArcGIS/rest/services/RPAS_AVIGIS1/FeatureServer/0/query?where=1%3D1&outFields=*&outSR=4326&f=geojson"
    );
    if (rpasResponse.ok) {
      const rpasData = await rpasResponse.json();
      L.geoJSON(rpasData, {
        style: { color: "#f97316", weight: 2, fillColor: "#f97316", fillOpacity: 0.15 },
        onEachFeature: (feature, layer) => {
          const name = feature.properties?.navn || feature.properties?.name || "RPAS 5km sone";
          layer.bindPopup(`<strong>RPAS 5km</strong><br/>${name}`);
        },
      }).addTo(zonesLayer);
    }

    // RPAS CTR/TIZ zones (pink)
    const ctrResponse = await fetch(
      "https://services.arcgis.com/a8CwScMFSS2ljjgn/ArcGIS/rest/services/RPAS_CTR_TIZ/FeatureServer/0/query?where=1%3D1&outFields=*&outSR=4326&f=geojson"
    );
    if (ctrResponse.ok) {
      const ctrData = await ctrResponse.json();
      L.geoJSON(ctrData, {
        style: { color: "#ec4899", weight: 2, fillColor: "#ec4899", fillOpacity: 0.15 },
        onEachFeature: (feature, layer) => {
          const name = feature.properties?.navn || feature.properties?.name || "CTR/TIZ";
          layer.bindPopup(`<strong>RPAS CTR/TIZ</strong><br/>${name}`);
        },
      }).addTo(zonesLayer);
    }

    // Live NOTAMs from database
    try {
      const { data: notams } = await supabase
        .from('notams')
        .select('notam_id, notam_text, geometry_geojson, effective_start, effective_end, effective_end_interpretation');

      if (notams) {
        for (const notam of notams) {
          if (!notam.geometry_geojson) continue;
          // Skip expired NOTAMs
          if (notam.effective_end && new Date(notam.effective_end) < new Date() &&
              notam.effective_end_interpretation !== 'PERM' && notam.effective_end_interpretation !== 'EST') continue;

          try {
            const geojson = typeof notam.geometry_geojson === 'string'
              ? JSON.parse(notam.geometry_geojson)
              : notam.geometry_geojson;

            L.geoJSON(geojson, {
              style: { color: "#f59e0b", weight: 2, fillColor: "#f59e0b", fillOpacity: 0.15 },
              pointToLayer: (_feature, latlng) => {
                return L.marker(latlng, {
                  icon: L.divIcon({
                    className: '',
                    html: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="32" viewBox="0 0 24 32">
                      <path d="M12 0C5.4 0 0 5.4 0 12c0 9 12 20 12 20s12-11 12-20C24 5.4 18.6 0 12 0z" fill="#f59e0b" stroke="#b45309" stroke-width="1"/>
                      <text x="12" y="16" text-anchor="middle" fill="white" font-weight="bold" font-size="14">!</text>
                    </svg>`,
                    iconSize: [24, 32],
                    iconAnchor: [12, 32],
                  }),
                });
              },
              onEachFeature: (_feature, layer) => {
                const text = notam.notam_text || notam.notam_id || 'NOTAM';
                layer.bindPopup(`<strong>NOTAM</strong><br/><div style="max-width:300px;max-height:200px;overflow:auto;font-size:12px;">${text}</div>`);
              },
            }).addTo(zonesLayer);
          } catch {}
        }
      }
    } catch (err) {
      console.error("Feil ved henting av NOTAMs:", err);
    }
  } catch (err) {
    console.error("Feil ved henting av luftromssoner:", err);
  }
}
