import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useState, useEffect, useMemo, useRef, useCallback, lazy, Suspense } from "react";
import L from "leaflet";
import { FlightAnalysisTimeline } from "./FlightAnalysisTimeline";

const Drone3DViewer = lazy(() => import("./Drone3DViewer").then(m => ({ default: m.Drone3DViewer })));
import { BarChart3, AlertTriangle, Gauge, Wind } from "lucide-react";
import { droneAnimatedIcon } from "@/lib/mapIcons";
import "leaflet/dist/leaflet.css";

export interface BatterySummary {
  cycles: number | null;
  healthPct: number | null;
  fullCapacityMah: number | null;
  voltageMinV: number | null;
  tempMaxC: number | null;
  cellDeviationV: number | null;
}

interface FlightAnalysisDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  flightTrack: { positions: any[]; events?: any[]; batterySummary?: BatterySummary } | null;
  flightDate?: string;
  droneName?: string;
}

const getEventColor = (type: string) => {
  if (type === 'RTH' || type === 'app_warning_critical' || type === 'error' || type === 'failsafe') return 'hsl(0, 84%, 60%)';
  if (type === 'LOW_BATTERY' || type === 'app_warning_important') return 'hsl(38, 92%, 50%)';
  if (type === 'arm') return 'hsl(142, 76%, 36%)';
  if (type === 'disarm') return 'hsl(215, 20%, 65%)';
  if (type === 'mode_change') return 'hsl(210, 80%, 50%)';
  return 'hsl(25, 95%, 53%)'; // APP_WARNING / info / message
};

const degreesToCardinal = (deg: number): string => {
  const dirs = ['N','NNE','NE','ENE','E','ESE','SE','SSE','S','SSW','SW','WSW','W','WNW','NW','NNW'];
  return dirs[Math.round(((deg % 360 + 360) % 360) / 22.5) % 16];
};

const getSpeedColor = (speed: number, maxSpeed: number) => {
  if (maxSpeed <= 0) return 'hsl(142, 76%, 36%)';
  const ratio = Math.min(speed / maxSpeed, 1);
  if (ratio < 0.33) return 'hsl(142, 76%, 36%)'; // green
  if (ratio < 0.66) return 'hsl(45, 93%, 47%)';  // yellow
  return 'hsl(0, 84%, 60%)';                      // red
};

export const FlightAnalysisDialog = ({ open, onOpenChange, flightTrack, flightDate, droneName }: FlightAnalysisDialogProps) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [mapReady, setMapReady] = useState(false);
  const [tileError, setTileError] = useState(false);
  const [showWarnings, setShowWarnings] = useState(false);
  const [showSpeedTrail, setShowSpeedTrail] = useState(true);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const droneMarkerRef = useRef<L.Marker | null>(null);
  const trailLineRef = useRef<L.Polyline | null>(null);
  const fullLineRef = useRef<L.Polyline | null>(null);
  const startMarkerRef = useRef<L.CircleMarker | null>(null);
  const endMarkerRef = useRef<L.CircleMarker | null>(null);
  const warningLayerRef = useRef<L.LayerGroup | null>(null);
  const speedLayerRef = useRef<L.LayerGroup | null>(null);
  const initAttemptRef = useRef(0);
  const timersRef = useRef<number[]>([]);

  const positions = useMemo(() => flightTrack?.positions || [], [flightTrack]);
  const events = useMemo(() => flightTrack?.events || [], [flightTrack]);

  useEffect(() => { setCurrentIndex(0); }, [flightTrack]);

  const polylinePositions = useMemo(() =>
    positions.map((p: any) => [p.lat, p.lng] as [number, number]),
    [positions]
  );

  const mapCenter = useMemo(() => {
    if (!positions.length) return [59.9, 10.7] as [number, number];
    return [positions[0].lat, positions[0].lng] as [number, number];
  }, [positions]);

  const hasAdvancedData = useMemo(() =>
    positions.some((p: any) => p.speed !== undefined || p.rcAileron !== undefined || p.gimbalPitch !== undefined),
    [positions]
  );

  // Compute max speed for heatmap coloring
  const maxSpeed = useMemo(() => {
    let max = 0;
    positions.forEach((p: any) => { if (p.speed > max) max = p.speed; });
    return max;
  }, [positions]);

  // Compute event positions mapped to closest telemetry index
  const eventPositions = useMemo(() => {
    if (!events?.length || !positions.length) return [];
    return events.filter((e: any) => e.t_offset_ms != null).map((e: any) => {
      const targetSec = (e.t_offset_ms || 0) / 1000;
      let best = 0;
      let bestDiff = Infinity;
      positions.forEach((p: any, i: number) => {
        const match = p.timestamp?.match(/PT(\d+)S/);
        if (match) {
          const diff = Math.abs(parseInt(match[1]) - targetSec);
          if (diff < bestDiff) { bestDiff = diff; best = i; }
        }
      });
      const pos = positions[best];
      return { ...e, index: best, lat: pos?.lat, lng: pos?.lng };
    }).filter((e: any) => e.lat && e.lng);
  }, [events, positions]);

  const clearTimers = useCallback(() => {
    timersRef.current.forEach(t => clearTimeout(t));
    timersRef.current = [];
  }, []);

  const destroyMap = useCallback(() => {
    clearTimers();
    if (mapRef.current) {
      try { mapRef.current.remove(); } catch (_) {}
      mapRef.current = null;
    }
    droneMarkerRef.current = null;
    trailLineRef.current = null;
    fullLineRef.current = null;
    startMarkerRef.current = null;
    endMarkerRef.current = null;
    warningLayerRef.current = null;
    speedLayerRef.current = null;
    setMapReady(false);
    setTileError(false);
  }, [clearTimers]);

  // Initialize map with retry logic
  useEffect(() => {
    if (!open) return;

    initAttemptRef.current = 0;
    const maxAttempts = 15;

    const tryInitMap = () => {
      const container = mapContainerRef.current;
      if (!container || mapRef.current) return;
      if (container.clientWidth === 0 || container.clientHeight === 0) {
        initAttemptRef.current++;
        if (initAttemptRef.current < maxAttempts) {
          const t = window.setTimeout(tryInitMap, 100);
          timersRef.current.push(t);
        }
        return;
      }

      try {
        const map = L.map(container, {
          center: mapCenter,
          zoom: 15,
          zoomControl: false,
          attributionControl: false,
        });

        let tilesLoaded = false;
        const tileLayer = L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", { maxZoom: 19, attribution: '' });

        tileLayer.on("tileload", () => {
          if (!tilesLoaded) {
            tilesLoaded = true;
            setTileError(false);
          }
        });

        tileLayer.on("tileerror", () => {
          const t = window.setTimeout(() => {
            if (!tilesLoaded) setTileError(true);
          }, 5000);
          timersRef.current.push(t);
        });

        tileLayer.addTo(map);

        // Full track (faded)
        if (polylinePositions.length > 1) {
          fullLineRef.current = L.polyline(polylinePositions, { color: "hsl(210, 80%, 50%)", weight: 2, opacity: 0.3 }).addTo(map);
          map.fitBounds(fullLineRef.current.getBounds(), { padding: [30, 30] });
        }

        // Start marker
        if (positions.length > 0) {
          startMarkerRef.current = L.circleMarker([positions[0].lat, positions[0].lng], {
            radius: 5, color: "hsl(142, 76%, 36%)", fillColor: "hsl(142, 76%, 36%)", fillOpacity: 1,
          }).addTo(map);
        }

        // End marker
        if (positions.length > 1) {
          const last = positions[positions.length - 1];
          endMarkerRef.current = L.circleMarker([last.lat, last.lng], {
            radius: 5, color: "hsl(0, 84%, 60%)", fillColor: "hsl(0, 84%, 60%)", fillOpacity: 1,
          }).addTo(map);
        }

        mapRef.current = map;

        // Staggered invalidateSize for dialog animation
        [100, 300, 500, 800, 1200].forEach(delay => {
          const t = window.setTimeout(() => {
            if (mapRef.current) {
              mapRef.current.invalidateSize();
              if (fullLineRef.current) {
                mapRef.current.fitBounds(fullLineRef.current.getBounds(), { padding: [30, 30] });
              }
            }
          }, delay);
          timersRef.current.push(t);
        });

        const readyTimer = window.setTimeout(() => setMapReady(true), 400);
        timersRef.current.push(readyTimer);

      } catch (e) {
        console.error("FlightAnalysisDialog: map init failed", e);
        initAttemptRef.current++;
        if (initAttemptRef.current < maxAttempts) {
          const t = window.setTimeout(tryInitMap, 200);
          timersRef.current.push(t);
        }
      }
    };

    const t = window.setTimeout(tryInitMap, 150);
    timersRef.current.push(t);

    return () => {
      destroyMap();
    };
  }, [open, mapCenter, polylinePositions, positions, clearTimers, destroyMap]);

  // Warning markers layer
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;

    // Clear existing
    if (warningLayerRef.current) {
      map.removeLayer(warningLayerRef.current);
      warningLayerRef.current = null;
    }

    if (!showWarnings || !eventPositions.length) return;

    const group = L.layerGroup();
    eventPositions.forEach((e: any) => {
      const color = getEventColor(e.type);
      const marker = L.circleMarker([e.lat, e.lng], {
        radius: 7,
        color,
        fillColor: color,
        fillOpacity: 0.7,
        weight: 2,
      });
      marker.bindPopup(
        `<div style="font-size:12px;max-width:200px"><strong>${e.type}</strong><br/>${e.message}</div>`,
        { closeButton: false, className: 'warning-popup' }
      );
      marker.addTo(group);
    });
    group.addTo(map);
    warningLayerRef.current = group;
  }, [showWarnings, eventPositions, mapReady]);

  // Speed-colored trail layer
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;

    // Clear existing speed layer
    if (speedLayerRef.current) {
      map.removeLayer(speedLayerRef.current);
      speedLayerRef.current = null;
    }

    // Toggle full trail visibility
    if (fullLineRef.current) {
      if (showSpeedTrail) {
        fullLineRef.current.setStyle({ opacity: 0 });
      } else {
        fullLineRef.current.setStyle({ opacity: 0.3 });
      }
    }

    if (!showSpeedTrail || positions.length < 2) return;

    const group = L.layerGroup();
    for (let i = 0; i < positions.length - 1; i++) {
      const p1 = positions[i];
      const p2 = positions[i + 1];
      const speed = p1.speed ?? 0;
      const color = getSpeedColor(speed, maxSpeed);
      L.polyline(
        [[p1.lat, p1.lng], [p2.lat, p2.lng]],
        { color, weight: 3, opacity: 0.85 }
      ).addTo(group);
    }
    group.addTo(map);
    speedLayerRef.current = group;
  }, [showSpeedTrail, positions, maxSpeed, mapReady]);

  // Update drone marker + trail on index change
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady || !positions.length) return;

    const current = positions[currentIndex];
    if (!current) return;
    const pos: [number, number] = [current.lat, current.lng];

    // Drone marker
    if (droneMarkerRef.current) {
      droneMarkerRef.current.setLatLng(pos);
    } else {
      const icon = L.icon({
        iconUrl: droneAnimatedIcon,
        iconSize: [72, 72],
        iconAnchor: [36, 36],
        className: 'drone-analysis-marker',
      });
      droneMarkerRef.current = L.marker(pos, { icon, zIndexOffset: 1000 }).addTo(map);
    }

    // Trail (only when not showing speed trail, to avoid duplication)
    if (!showSpeedTrail) {
      const trail = polylinePositions.slice(0, currentIndex + 1);
      if (trail.length > 1) {
        if (trailLineRef.current) {
          trailLineRef.current.setLatLngs(trail);
        } else {
          trailLineRef.current = L.polyline(trail, { color: "hsl(210, 80%, 50%)", weight: 3, opacity: 0.8 }).addTo(map);
        }
      }
    } else if (trailLineRef.current) {
      map.removeLayer(trailLineRef.current);
      trailLineRef.current = null;
    }

    // Offset drone based on viewport: more left on phone, slightly left on tablet/desktop
    const hasGyro = current.pitch !== undefined;
    if (hasGyro) {
      const mapSize = map.getSize();
      const targetPoint = map.latLngToContainerPoint(pos);
      const isLargeViewport = mapSize.x >= 640;
      const offsetX = isLargeViewport ? mapSize.x / 12 : mapSize.x / 6;
      const offsetPoint = L.point(targetPoint.x + offsetX, targetPoint.y);
      const offsetLatLng = map.containerPointToLatLng(offsetPoint);
      map.panTo(offsetLatLng, { animate: true, duration: 0.3 });
    } else {
      map.panTo(pos, { animate: true, duration: 0.3 });
    }
  }, [currentIndex, positions, polylinePositions, mapReady, showSpeedTrail]);

  if (!flightTrack || !positions.length) return null;

  const hasSpeedData = positions.some((p: any) => p.speed !== undefined);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[98vw] max-w-5xl max-h-[95vh] flex flex-col p-3 sm:p-4 gap-3">
        <DialogHeader className="pb-0">
          <DialogTitle className="flex items-center gap-2 text-base sm:text-lg">
            <BarChart3 className="w-5 h-5 text-primary" />
            Flyanalyse
            {droneName && <span className="text-muted-foreground font-normal">— {droneName}</span>}
          </DialogTitle>
          <DialogDescription className="sr-only">Detaljert flyanalyse med kart og telemetri</DialogDescription>
          <div className="flex items-center gap-2 flex-wrap">
            {flightDate && (
              <Badge variant="outline" className="text-xs">
                {new Date(flightDate).toLocaleDateString('nb-NO', { day: '2-digit', month: 'short', year: 'numeric' })}
              </Badge>
            )}
            <Badge variant="outline" className="text-xs">{positions.length} datapunkter</Badge>
            {!hasAdvancedData && (
              <Badge variant="outline" className="text-xs border-amber-500/50 text-amber-700 dark:text-amber-300">
                <AlertTriangle className="w-3 h-3 mr-1" />
                Begrenset telemetri (importert før utvidet analyse)
              </Badge>
            )}
            {events.length > 0 && (
              <Badge variant="outline" className="text-xs border-destructive/50 text-destructive">
                {events.length} hendelser
              </Badge>
            )}
          </div>
        </DialogHeader>

        {/* Map */}
        <div className="relative">
          <div
            ref={mapContainerRef}
            className="h-[200px] sm:h-[280px] rounded-lg overflow-hidden border border-border relative z-0"
          />
          {/* Tile error fallback */}
          {tileError && (
            <div className="absolute inset-0 flex items-center justify-center bg-muted/80 rounded-lg z-[5]">
              <p className="text-sm text-muted-foreground">Kartet kunne ikke lastes – prøv å åpne analysen på nytt</p>
            </div>
          )}

          {/* Map overlay controls — top left */}
          {mapReady && (
            <div className="absolute top-2 left-2 z-10 flex gap-1.5">
              {hasSpeedData && (
                <Button
                  size="icon"
                  variant={showSpeedTrail ? "default" : "secondary"}
                  className="h-8 w-8 rounded-lg shadow-md"
                  onClick={() => setShowSpeedTrail(v => !v)}
                  title="Fargelegg rute etter hastighet"
                >
                  <Gauge className="w-4 h-4" />
                </Button>
              )}
              {events.length > 0 && (
                <Button
                  size="icon"
                  variant={showWarnings ? "default" : "secondary"}
                  className="h-8 w-8 rounded-lg shadow-md"
                  onClick={() => setShowWarnings(v => !v)}
                  title="Vis advarsler på kart"
                >
                  <AlertTriangle className="w-4 h-4" />
                </Button>
              )}
            </div>
          )}

          {/* Wind indicator */}
          {mapReady && positions[currentIndex]?.windDir !== undefined && (
            (() => {
              const current = positions[currentIndex];
              const windDeg = current.windDir ?? 0;
              const windSpd = current.maxWindSpeed ?? current.windSpeed;
              const cardinal = degreesToCardinal(windDeg);
              return (
                <div className="absolute top-12 left-2 z-10 bg-background/80 backdrop-blur-sm rounded-lg px-2 py-1.5 flex items-center gap-1.5 border border-border shadow-md">
                  <svg
                    width="20"
                    height="20"
                    viewBox="0 0 20 20"
                    style={{ transform: `rotate(${windDeg + 180}deg)` }}
                    className="text-primary shrink-0"
                  >
                    <path d="M10 2 L14 14 L10 11 L6 14 Z" fill="currentColor" />
                  </svg>
                  <div className="flex flex-col leading-none">
                    {windSpd !== undefined && (
                      <span className="text-[11px] font-semibold text-foreground">{windSpd.toFixed(1)} m/s</span>
                    )}
                    <span className="text-[9px] text-muted-foreground">{cardinal}</span>
                  </div>
                </div>
              );
            })()
          )}

          {/* Speed legend */}
          {mapReady && showSpeedTrail && (
            <div className="absolute bottom-2 left-2 z-10 bg-background/80 backdrop-blur-sm rounded-md px-2 py-1 flex items-center gap-1.5 text-[10px] border border-border shadow-sm">
              <span className="text-muted-foreground">Sakte</span>
              <div className="w-12 h-2 rounded-full" style={{
                background: 'linear-gradient(to right, hsl(142,76%,36%), hsl(45,93%,47%), hsl(0,84%,60%))'
              }} />
              <span className="text-muted-foreground">Rask</span>
            </div>
          )}

          {/* Attitude indicator overlay — fills map height on sm+ */}
          {mapReady && positions[currentIndex]?.pitch !== undefined && (
            <div className="absolute top-2 right-2 bottom-2 z-10 w-[108px] sm:w-auto">
              <Suspense fallback={<div className="w-full h-full rounded-lg bg-background/80 animate-pulse flex items-center justify-center"><span className="text-[11px] text-muted-foreground">Laster 3D-modell…</span></div>}>
                <Drone3DViewer
                  pitch={positions[currentIndex]?.pitch ?? 0}
                  roll={positions[currentIndex]?.roll ?? 0}
                  yaw={positions[currentIndex]?.yaw}
                />
              </Suspense>
            </div>
          )}
        </div>

        {/* Timeline + Charts */}
        <div className="flex-1 min-h-0 overflow-y-auto">
          <FlightAnalysisTimeline
            positions={positions}
            currentIndex={currentIndex}
            onIndexChange={setCurrentIndex}
            events={events}
            showWarnings={showWarnings}
            batterySummary={flightTrack?.batterySummary}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
};