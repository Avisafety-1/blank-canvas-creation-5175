import { useEffect, useRef, useState, useCallback } from "react";

import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { openAipConfig } from "@/lib/openaip";
import { supabase } from "@/integrations/supabase/client";
import { MapLayerControl, LayerConfig } from "@/components/MapLayerControl";
import { ArealbrukLegend } from "@/components/ArealbrukLegend";
import { BefolkningLegend } from "@/components/BefolkningLegend";
import { TettstederLegend } from "@/components/TettstederLegend";
import { Button } from "@/components/ui/button";
import { CloudSun, Route, Satellite, Mountain, Map as MapIcon } from "lucide-react";
import { renderSoraZones, renderAdjacentAreaZone } from "@/lib/soraGeometry";
import { useAuth } from "@/contexts/AuthContext";

// Re-export types for backward compatibility
export type { RoutePoint, RouteData, SoraSettings } from "@/types/map";
import type { RoutePoint, RouteData, SoraSettings } from "@/types/map";

// Extracted modules
import { calculateDistance, calculateTotalDistance, calculatePolygonAreaKm2 } from "@/lib/mapGeometry";
import {
  fetchNsmData,
  fetchRpasData,
  fetchAllAipZones,
  fetchObstacles,
  fetchAirportsData,
  fetchAndDisplayMissions,
  fetchDroneTelemetry,
  fetchActiveAdvisories,
  fetchPilotPositions,
  fetchNaturvernZones,
  fetchVernRestrictionZones,
  fetchKraftledningerInBounds,
  fetchAisVesselsInBounds,
  fetchNotams,
} from "@/lib/mapDataFetchers";
import { createSafeSkyManager } from "@/lib/mapSafeSky";
import { showWeatherPopup } from "@/lib/mapWeatherPopup";
import type { RouteMultiPolygon, SsbPopulationCell } from "@/lib/adjacentAreaCalculator";

const DEFAULT_POS: [number, number] = [63.7, 9.6];
const TENSIO_WMS_URL = "https://tensio-prod-k8s10.cloudgis.no/arcgis/services/luftnett/luftnett/MapServer/WMSServer";

const isTensioName = (name?: string | null) => name?.toLowerCase().includes("tensio") ?? false;

const escapePopupHtml = (value: unknown) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const formatFeatureInfoPopup = (title: string, properties: Record<string, unknown>) => {
  const hiddenKeys = new Set(["objectid", "globalid", "shape", "shape_length", "shape__length", "shape_area", "shape__area"]);
  const rows = Object.entries(properties)
    .filter(([key, value]) => value !== null && value !== undefined && String(value).trim() !== "" && !hiddenKeys.has(key.toLowerCase()))
    .slice(0, 10)
    .map(([key, value]) => `<div style="display:grid;grid-template-columns:minmax(78px,0.9fr) minmax(110px,1.2fr);gap:8px;font-size:12px;line-height:1.35;padding:2px 0;"><span style="color:#64748b;overflow-wrap:anywhere;">${escapePopupHtml(key)}</span><strong style="font-weight:600;overflow-wrap:anywhere;">${escapePopupHtml(value)}</strong></div>`)
    .join("");

  return `<div style="min-width:190px;max-width:280px;"><strong>${escapePopupHtml(title)}</strong>${rows ? `<div style="margin-top:6px;">${rows}</div>` : "<br/>Ingen detaljer tilgjengelig"}</div>`;
};

const buildTensioFeatureInfoUrl = (map: L.Map, latlng: L.LatLng, infoFormat = "application/geo+json") => {
  const size = map.getSize();
  const point = map.latLngToContainerPoint(latlng);
  const crs = map.options.crs;
  const sw = crs.project(map.getBounds().getSouthWest());
  const ne = crs.project(map.getBounds().getNorthEast());
  const params = new URLSearchParams({
    service: "WMS",
    request: "GetFeatureInfo",
    version: "1.3.0",
    layers: "0,1,2,3,4,5,6,7,8,9",
    query_layers: "0,1,2,3,4,5,6,7,8,9",
    styles: "",
    crs: "EPSG:3857",
    bbox: `${sw.x},${sw.y},${ne.x},${ne.y}`,
    width: String(size.x),
    height: String(size.y),
    i: String(Math.round(point.x)),
    j: String(Math.round(point.y)),
    feature_count: "5",
    info_format: infoFormat,
    format: "image/png",
    transparent: "true",
  });
  return `${TENSIO_WMS_URL}?${params.toString()}`;
};

const formatPlainFeatureInfoPopup = (title: string, text: string) => {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).slice(0, 12);
  if (!lines.length || lines.every((line) => /no features|empty|none/i.test(line))) return "";
  return `<div style="min-width:190px;max-width:280px;"><strong>${escapePopupHtml(title)}</strong><div style="margin-top:6px;font-size:12px;line-height:1.35;white-space:pre-wrap;overflow-wrap:anywhere;">${escapePopupHtml(lines.join("\n"))}</div></div>`;
};

const getPopulationDensityStyle = (density = 0, isHotspot = false): L.PathOptions => {
  const color = density >= 5000 ? 'hsl(var(--destructive))' : density >= 250 ? 'hsl(var(--warning))' : 'hsl(var(--success))';
  return {
    color,
    fillColor: color,
    weight: isHotspot ? 2.5 : 1,
    opacity: isHotspot ? 1 : 0.75,
    fillOpacity: isHotspot ? 0.58 : 0.34,
    pane: 'populationDensityPane',
  };
};

interface OpenAIPMapProps {
  onMissionClick?: (mission: any) => void;
  mode?: "view" | "routePlanning";
  existingRoute?: RouteData | null;
  onRouteChange?: (route: RouteData) => void;
  initialCenter?: [number, number];
  controlledRoute?: RouteData | null;
  onStartRoutePlanning?: () => void;
  onPilotPositionChange?: (position: RoutePoint | undefined) => void;
  pilotPosition?: RoutePoint;
  pilotVlosRadiusM?: number;
  pilotAlosCalculation?: string;
  isPlacingPilot?: boolean;
  focusFlightId?: string | null;
  onFocusFlightHandled?: () => void;
  soraSettings?: SoraSettings;
  adjacentAreaRadiusM?: number;
  populationDensityCells?: SsbPopulationCell[];
  populationDensityCoveragePolygons?: RouteMultiPolygon;
}

export function OpenAIPMap({ 
  onMissionClick, 
  mode = "view", 
  existingRoute,
  onRouteChange,
  initialCenter,
  controlledRoute,
  onStartRoutePlanning,
  onPilotPositionChange,
  pilotPosition,
  pilotVlosRadiusM,
  pilotAlosCalculation,
  isPlacingPilot,
  focusFlightId,
  onFocusFlightHandled,
  soraSettings,
  adjacentAreaRadiusM,
  populationDensityCells,
  populationDensityCoveragePolygons,
}: OpenAIPMapProps) {
  const { user, companyName, parentCompanyName, companyLat, companyLon, profileLoaded } = useAuth();
  const isTensioHierarchy = isTensioName(companyName) || isTensioName(parentCompanyName);
  const mapRef = useRef<HTMLDivElement | null>(null);
  const leafletMapRef = useRef<L.Map | null>(null);
  const userMarkerRef = useRef<L.CircleMarker | null>(null);
  // Keep focusFlightId in a ref so async geolocation callbacks see the latest value
  // (otherwise the closure captured at map-init time stays null and GPS overrides the focus).
  const focusFlightIdRef = useRef<string | null>(focusFlightId ?? null);
  useEffect(() => {
    focusFlightIdRef.current = focusFlightId ?? null;
  }, [focusFlightId]);
  const missionsLayerRef = useRef<L.LayerGroup | null>(null);
  const routeLayerRef = useRef<L.LayerGroup | null>(null);
  const nsmGeoJsonRef = useRef<L.GeoJSON<any> | null>(null);
  const rpasGeoJsonRef = useRef<L.GeoJSON<any> | null>(null);
  const aipGeoJsonLayersRef = useRef<L.GeoJSON[]>([]);
  const routePointsRef = useRef<RoutePoint[]>(existingRoute?.coordinates || []);
  const [routePointCount, setRoutePointCount] = useState(existingRoute?.coordinates?.length || 0);
  const pilotMarkerRef = useRef<L.Marker | null>(null);
  const pilotCircleRef = useRef<L.Circle | null>(null);
  const pilotLayerRef = useRef<L.LayerGroup | null>(null);
  const flightMarkersRef = useRef<Map<string, L.Marker>>(new Map());
  const soraSettingsRef = useRef(soraSettings);
  const soraLayerRef = useRef<L.LayerGroup | null>(null);
  const adjacentAreaLayerRef = useRef<L.LayerGroup | null>(null);
  const populationDensityLayerRef = useRef<L.LayerGroup | null>(null);
  const populationDensityRendererRef = useRef<L.Renderer | null>(null);
  const adjacentAreaRadiusMRef = useRef(adjacentAreaRadiusM);
  const populationDensityCellsRef = useRef<SsbPopulationCell[] | undefined>(populationDensityCells);
  const populationDensityCoverageRef = useRef<RouteMultiPolygon | undefined>(populationDensityCoveragePolygons);
  const [layers, setLayers] = useState<LayerConfig[]>([]);
  const [weatherEnabled, setWeatherEnabled] = useState(false);
  const [baseLayerType, setBaseLayerType] = useState<'osm' | 'satellite' | 'topo'>('osm');
  const baseLayerRef = useRef<L.TileLayer | null>(null);
  const isPlacingPilotRef = useRef(isPlacingPilot);
  const onPilotPositionChangeRef = useRef(onPilotPositionChange);
  const weatherEnabledRef = useRef(false);
  const modeRef = useRef(mode);

  const onMissionClickRef = useRef<typeof onMissionClick>(onMissionClick);
  const onRouteChangeRef = useRef<typeof onRouteChange>(onRouteChange);

  const ensurePopulationDensityPane = useCallback((map: L.Map): HTMLElement | null => {
    if (!map.getPane('populationDensityPane')) {
      map.createPane('populationDensityPane');
    }

    const pane = map.getPane('populationDensityPane');
    if (!pane) return null;
    pane.style.zIndex = '635';
    pane.style.pointerEvents = modeRef.current === 'routePlanning' ? 'none' : 'auto';
    return pane;
  }, []);

  const getPopulationDensityRenderer = useCallback((map: L.Map): L.Renderer | undefined => {
    const pane = ensurePopulationDensityPane(map);
    if (!pane) return undefined;
    if (!populationDensityRendererRef.current || !(populationDensityRendererRef.current as any)._map) {
      populationDensityRendererRef.current = L.svg({ pane: 'populationDensityPane' });
    }
    return populationDensityRendererRef.current ?? undefined;
  }, [ensurePopulationDensityPane]);

  const setGeoJsonInteractivity = useCallback(
    (geoJson: L.GeoJSON<any> | null, enabled: boolean) => {
      if (!geoJson) return;

      (geoJson as any).options = { ...(geoJson as any).options, interactive: enabled };

      geoJson.eachLayer((layer: any) => {
        if (layer?.options) {
          layer.options.interactive = enabled;
          layer.options.bubblingMouseEvents = true;
        }

        const el = typeof layer.getElement === "function" ? layer.getElement() : layer?._path;
        if (el) {
          (el as HTMLElement).style.pointerEvents = enabled ? "auto" : "none";
        }

        if (!enabled && typeof layer.removeInteractiveTarget === "function" && el) {
          if (layer._map) layer.removeInteractiveTarget(el);
        } else if (enabled && typeof layer.addInteractiveTarget === "function" && el) {
          if (layer._map) layer.addInteractiveTarget(el);
        }
      });
    },
    []
  );

  // Switch between base map layers
  const switchBaseLayer = useCallback((newType: 'osm' | 'satellite' | 'topo') => {
    if (!leafletMapRef.current || !baseLayerRef.current) return;
    
    const map = leafletMapRef.current;
    map.removeLayer(baseLayerRef.current);
    
    let url: string;
    let attribution: string;
    let subdomains: string | string[] = 'abc';
    
    switch (newType) {
      case 'satellite':
        url = openAipConfig.tiles.satellite;
        attribution = openAipConfig.attribution.satellite;
        subdomains = [];
        break;
      case 'topo':
        url = openAipConfig.tiles.topo;
        attribution = openAipConfig.attribution.topo;
        break;
      default:
        url = openAipConfig.tiles.base;
        attribution = openAipConfig.attribution.osm;
    }
    
    const newLayer = L.tileLayer(url, { attribution, subdomains }).addTo(map);
    newLayer.bringToBack();
    baseLayerRef.current = newLayer;
    setBaseLayerType(newType);
  }, []);

  // Sync refs with state/props
  useEffect(() => {
    weatherEnabledRef.current = weatherEnabled;
    if (leafletMapRef.current) {
      const container = leafletMapRef.current.getContainer();
      if (weatherEnabled) {
        container.classList.add('weather-mode-active');
      } else {
        container.classList.remove('weather-mode-active');
      }
    }
  }, [weatherEnabled]);
  useEffect(() => { onMissionClickRef.current = onMissionClick; }, [onMissionClick]);
  useEffect(() => { onRouteChangeRef.current = onRouteChange; }, [onRouteChange]);
  useEffect(() => { isPlacingPilotRef.current = isPlacingPilot; }, [isPlacingPilot]);
  useEffect(() => { onPilotPositionChangeRef.current = onPilotPositionChange; }, [onPilotPositionChange]);

  // Update route display
  const updateRouteDisplay = useCallback(() => {
    if (!routeLayerRef.current || !leafletMapRef.current) return;

    routeLayerRef.current.clearLayers();
    const points = routePointsRef.current;

    if (points.length === 0) return;

    // Draw polyline
    if (points.length > 1) {
      const latLngs = points.map((p) => [p.lat, p.lng] as [number, number]);
      L.polyline(latLngs, {
        color: '#3b82f6',
        weight: 3,
        opacity: 0.8,
        dashArray: '10, 5',
        pane: 'routePane',
      }).addTo(routeLayerRef.current);
    }

    // Add numbered markers
    points.forEach((point, index) => {
      const isFirst = index === 0;
      const isLast = index === points.length - 1 && points.length > 1;

      let bgColor = '#3b82f6';
      if (isFirst) bgColor = '#22c55e';
      else if (isLast) bgColor = '#ef4444';

      const marker = L.marker([point.lat, point.lng], {
        icon: L.divIcon({
          className: 'route-marker',
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
            cursor: ${modeRef.current === 'routePlanning' ? 'move' : 'default'};
          ">${index + 1}</div>`,
          iconSize: [28, 28],
          iconAnchor: [14, 14],
        }),
        draggable: modeRef.current === 'routePlanning',
        pane: 'routePane',
      });

      if (modeRef.current === 'routePlanning') {
        marker.on('dragend', (e: any) => {
          const { lat, lng } = e.target.getLatLng();
          routePointsRef.current[index] = { lat, lng };
          updateRouteDisplay();
          const cb = onRouteChangeRef.current;
          if (cb) {
            const coords = [...routePointsRef.current];
            cb({ coordinates: coords, totalDistance: calculateTotalDistance(coords), areaKm2: calculatePolygonAreaKm2(coords) });
          }
        });

        marker.on('contextmenu', (e: any) => {
          L.DomEvent.stopPropagation(e);
          routePointsRef.current.splice(index, 1);
          updateRouteDisplay();
          const cb = onRouteChangeRef.current;
          if (cb) {
            const coords = [...routePointsRef.current];
            cb({ coordinates: coords, totalDistance: calculateTotalDistance(coords), areaKm2: calculatePolygonAreaKm2(coords) });
          }
        });
      }

      let popupContent = `<strong>Punkt ${index + 1}</strong>`;
      if (index > 0) {
        const dist = calculateDistance(points[index - 1].lat, points[index - 1].lng, point.lat, point.lng);
        popupContent += `<br/>Avstand fra forrige: ${dist.toFixed(2)} km`;
      }
      if (modeRef.current === 'routePlanning') {
        popupContent += '<br/><em style="font-size: 11px; color: #666;">Dra for å flytte, høyreklikk for å slette</em>';
      }
      marker.bindPopup(popupContent);
      marker.addTo(routeLayerRef.current!);
    });

    // Total distance label
    if (points.length > 1) {
      const totalDist = calculateTotalDistance(points);
      const midPoint = points[Math.floor(points.length / 2)];
      L.marker([midPoint.lat, midPoint.lng], {
        icon: L.divIcon({
          className: 'route-marker',
          html: `<div style="
            background: white;
            padding: 4px 8px;
            border-radius: 4px;
            font-size: 11px;
            font-weight: 600;
            box-shadow: 0 1px 4px rgba(0,0,0,0.2);
            white-space: nowrap;
          ">Total: ${totalDist.toFixed(2)} km</div>`,
          iconSize: [100, 24],
          iconAnchor: [50, -10],
        }),
        interactive: false,
        pane: 'routePane',
      }).addTo(routeLayerRef.current);
    }

    // SORA operational volume zones
    if (!soraLayerRef.current) {
      soraLayerRef.current = L.layerGroup();
      if (leafletMapRef.current) {
        soraLayerRef.current.addTo(leafletMapRef.current);
      }
    }
    soraLayerRef.current.clearLayers();

    const sora = soraSettingsRef.current;
    if (sora?.enabled && points.length >= 1) {
      renderSoraZones(points, sora, soraLayerRef.current);
    }

    // Adjacent area zone
    if (!adjacentAreaLayerRef.current) {
      adjacentAreaLayerRef.current = L.layerGroup();
      if (leafletMapRef.current) {
        adjacentAreaLayerRef.current.addTo(leafletMapRef.current);
      }
    }
    adjacentAreaLayerRef.current.clearLayers();

    const adjRadius = adjacentAreaRadiusMRef.current;
    if (adjRadius && adjRadius > 0 && sora?.enabled && points.length >= 1) {
      renderAdjacentAreaZone(points, adjRadius, adjacentAreaLayerRef.current, sora);
    }

    // SSB 250 m population density cells for the active SORA/adjacent coverage.
    const map = leafletMapRef.current;
    const renderer = map ? getPopulationDensityRenderer(map) : undefined;

    if (!populationDensityLayerRef.current) {
      populationDensityLayerRef.current = L.layerGroup();
      if (leafletMapRef.current) {
        populationDensityLayerRef.current.addTo(leafletMapRef.current);
      }
    }
    populationDensityLayerRef.current.clearLayers();

    const densityCells = populationDensityCellsRef.current ?? [];
    const coveragePolygons = populationDensityCoverageRef.current ?? [];
    if (sora?.enabled && coveragePolygons.length > 0) {
      coveragePolygons.forEach((coverage) => {
        if (coverage.length < 3) return;
        L.polygon(coverage.map(p => [p.lat, p.lng] as [number, number]), {
          pane: 'populationDensityPane',
          renderer,
          interactive: false,
          color: 'hsl(var(--info))',
          fillColor: 'hsl(var(--info))',
          weight: 1,
          opacity: 0.32,
          fillOpacity: 0.07,
          dashArray: '4 4',
          className: 'ssb-density-coverage',
        } as L.PathOptions).addTo(populationDensityLayerRef.current!);
      });
    }
    if (sora?.enabled && densityCells.length > 0) {
      const explicitDriverIndex = densityCells.findIndex((cell) => cell.isDriver);
      const maxDensityIndex = explicitDriverIndex >= 0 ? explicitDriverIndex : densityCells.reduce((bestIndex, cell, index) => {
        const density = cell.densityPerKm2 ?? cell.population * 16;
        const bestCell = densityCells[bestIndex];
        const bestDensity = bestCell ? (bestCell.densityPerKm2 ?? bestCell.population * 16) : -Infinity;
        return density > bestDensity ? index : bestIndex;
      }, 0);
      densityCells.forEach((cell, index) => {
        const density = cell.densityPerKm2 ?? cell.population * 16;
        const isHotspot = index === maxDensityIndex;
        const densityLabel = `${Math.round(density).toLocaleString('nb-NO')} /km²`;
        const popup = `<strong>SSB 250 m-rute</strong><br/>${cell.population.toLocaleString('nb-NO')} personer i ruten<br/>${density.toLocaleString('nb-NO')} pers/km²${isHotspot ? '<br/><strong>Pådriver for utregning</strong>' : ''}`;
        const tooltip = `Pådriver · ${densityLabel}`;
        const tooltipOptions: L.TooltipOptions = {
          permanent: true,
          direction: 'center',
          className: 'ssb-density-label ssb-density-label-hotspot',
          opacity: 1,
        };
        const interactive = modeRef.current !== 'routePlanning';

        if (cell.polygon && cell.polygon.length >= 3) {
          const polygon = L.polygon(cell.polygon.map(p => [p.lat, p.lng] as [number, number]), { ...getPopulationDensityStyle(density, isHotspot), renderer, interactive })
            .bindPopup(popup);
          if (isHotspot) polygon.bindTooltip(tooltip, tooltipOptions);
          polygon.addTo(populationDensityLayerRef.current!);
        } else {
          const marker = L.circleMarker([cell.centroidLat, cell.centroidLng], {
            ...getPopulationDensityStyle(density, isHotspot),
            interactive,
            radius: isHotspot ? 7 : 4,
          }).bindPopup(popup);
          if (isHotspot) marker.bindTooltip(tooltip, tooltipOptions);
          marker.addTo(populationDensityLayerRef.current!);
        }
      });
    }
  }, [getPopulationDensityRenderer]);

  // Sync soraSettings ref and redraw
  useEffect(() => {
    soraSettingsRef.current = soraSettings;
    adjacentAreaRadiusMRef.current = adjacentAreaRadiusM;
    populationDensityCellsRef.current = populationDensityCells;
    populationDensityCoverageRef.current = populationDensityCoveragePolygons;
    if (routeLayerRef.current && leafletMapRef.current) {
      updateRouteDisplay();
    }
  }, [soraSettings, adjacentAreaRadiusM, populationDensityCells, populationDensityCoveragePolygons, updateRouteDisplay]);

  // Sync mode ref and toggle interactivity
  useEffect(() => {
    modeRef.current = mode;

    const vectorsInteractive = mode !== "routePlanning";
    setGeoJsonInteractivity(nsmGeoJsonRef.current, vectorsInteractive);
    setGeoJsonInteractivity(rpasGeoJsonRef.current, vectorsInteractive);
    aipGeoJsonLayersRef.current.forEach(layer => {
      setGeoJsonInteractivity(layer, vectorsInteractive);
    });

    if (leafletMapRef.current) {
      const map = leafletMapRef.current;
      const container = map.getContainer();
      if (mode === "routePlanning") {
        container.classList.add("route-planning-active");
      } else {
        container.classList.remove("route-planning-active");
      }
      const pointerEvents = mode === "routePlanning" ? "none" : "auto";
      const panesToDisable = ['overlayPane', 'aipPane', 'rmzPane', 'rpasPane', 'nsmPane', 'obstaclePane', 'airportPane', 'safeskyPane', 'missionPane', 'notamPane', 'notamPinPane', 'populationDensityPane'];
      for (const paneName of panesToDisable) {
        const pane = map.getPane(paneName);
        if (pane) {
          pane.style.pointerEvents = pointerEvents;
        }
      }
    }

    if (routeLayerRef.current && leafletMapRef.current) {
      updateRouteDisplay();
    }
  }, [mode, updateRouteDisplay, setGeoJsonInteractivity]);

  // Sync with controlled route from parent
  useEffect(() => {
    if (!controlledRoute) return;
    const controlled = controlledRoute.coordinates;
    const current = routePointsRef.current;
    const firstChanged =
      controlled.length > 0 && current.length > 0 &&
      (controlled[0].lat !== current[0].lat || controlled[0].lng !== current[0].lng);
    if (controlled.length < current.length || controlled.length === 0 || firstChanged || (controlled.length > 0 && current.length === 0)) {
      routePointsRef.current = [...controlled];
      setRoutePointCount(routePointsRef.current.length);
      updateRouteDisplay();
      if (controlled.length > 0 && leafletMapRef.current && (current.length === 0 || firstChanged)) {
        leafletMapRef.current.setView([controlled[0].lat, controlled[0].lng], leafletMapRef.current.getZoom());
      }
    }
  }, [controlledRoute?.coordinates.length, controlledRoute?.coordinates[0]?.lat, controlledRoute?.coordinates[0]?.lng, updateRouteDisplay]);

  // ==================== MAIN MAP INIT useEffect ====================
  useEffect(() => {
    if (!mapRef.current || !profileLoaded) return;

    const startCenter = initialCenter || DEFAULT_POS;
    const map = L.map(mapRef.current).setView(startCenter, initialCenter ? 13 : 8);
    leafletMapRef.current = map;

    // Create panes
    const paneConfig: Record<string, string> = {
      safeskyPane: '750', liveFlightPane: '720', missionPane: '680', notamPinPane: '675', airportPane: '670', routePane: '665',
      powerPane: '700', tensioPowerPane: '699', obstaclePane: '660', nsmPane: '650', notamPane: '640', populationDensityPane: '635',
      rpasPane: '630', aipPane: '625', rmzPane: '620',
    };
    const nonInteractivePanes = new Set(['aipPane', 'rmzPane', 'rpasPane', 'nsmPane', 'obstaclePane', 'airportPane', 'safeskyPane', 'overlayPane', 'notamPane', 'notamPinPane', 'populationDensityPane', 'tensioPowerPane']);
    for (const [paneName, zIndex] of Object.entries(paneConfig)) {
      map.createPane(paneName);
      const pane = map.getPane(paneName);
      if (pane) {
        pane.style.zIndex = zIndex;
        pane.style.pointerEvents = (mode === 'routePlanning' && nonInteractivePanes.has(paneName)) ? 'none' : 'auto';
      }
    }
    ensurePopulationDensityPane(map);
    populationDensityRendererRef.current = L.svg({ pane: 'populationDensityPane' });

    // Sørg for at popup-bokser alltid ligger over alle kartlag
    const popupPane = map.getPane('popupPane');
    if (popupPane) popupPane.style.zIndex = '800';
    const tooltipPane = map.getPane('tooltipPane');
    if (tooltipPane) tooltipPane.style.zIndex = '790';

    // Base layer
    const osmLayer = L.tileLayer(openAipConfig.tiles.base, {
      attribution: openAipConfig.attribution.osm,
      subdomains: "abc",
    }).addTo(map);
    baseLayerRef.current = osmLayer;

    const layerConfigs: LayerConfig[] = [];
    let tensioLuftnettLayer: L.TileLayer.WMS | null = null;

    // OpenAIP airspace
    if (openAipConfig.apiKey && openAipConfig.tiles.airspace) {
      const airspaceUrl = openAipConfig.tiles.airspace.replace("{key}", openAipConfig.apiKey);
      const airspaceLayer = L.tileLayer(airspaceUrl, { opacity: 0.55, subdomains: "abc" }).addTo(map);
      layerConfigs.push({ id: "airspace", name: "Luftrom (OpenAIP)", layer: airspaceLayer, enabled: true, icon: "layers" });
    }

    // NRL
    const nrlLayer = L.tileLayer.wms("https://wms.geonorge.no/skwms1/wms.nrl5?", {
      layers: "nrlflate,nrllinje,nrlluftspenn,nrlmast,nrlpunkt", format: "image/png", transparent: true, opacity: 0.8, attribution: 'NRL Luftfartshindre',
    });
    layerConfigs.push({ id: "nrl", name: "Luftfartshindre (NRL)", layer: nrlLayer, enabled: false, icon: "alertTriangle" });

    // Verneområder (naturvern + ferdsels-/landingsforbud) — vektorlag fra DB
    const naturvernLayer = L.layerGroup();
    layerConfigs.push({ id: "naturvern", name: "Verneområder", layer: naturvernLayer, enabled: false, icon: "treePine" });

    // SSB Arealbruk
    const arealbrukLayer = L.tileLayer.wms("https://wms.geonorge.no/skwms1/wms.arealbruk?", {
      layers: "arealbruk", format: "image/png", transparent: true, opacity: 0.6, attribution: "SSB Arealbruk", minZoom: 0, maxZoom: 20, tiled: true,
    } as any);
    layerConfigs.push({ id: "arealbruk", name: "Befolkning / Arealbruk (SSB)", layer: arealbrukLayer, enabled: false, icon: "users" });

    // SSB Befolkning
    const befolkningLayer = L.tileLayer.wms("https://kart.ssb.no/api/mapserver/v1/wms/befolkning_paa_rutenett", {
      layers: "befolkning_1km_2025", format: "image/png", transparent: true, opacity: 0.65,
      attribution: 'Befolkning 1km² © <a href="https://www.ssb.no">SSB</a>', minZoom: 0, maxZoom: 20, tiled: true, version: "1.3.0",
    } as any);
    layerConfigs.push({ id: "befolkning1km", name: "Befolkning 1 km (SSB)", layer: befolkningLayer, enabled: false, icon: "users" });

    // SSB Tettsteder (urban settlements ≥200 residents)
    const tettstederLayer = L.tileLayer.wms("https://kart.ssb.no/api/mapserver/v1/wms/tettsteder", {
      layers: "tettsted_2024", format: "image/png", transparent: true, opacity: 0.5,
      attribution: 'Tettsteder © <a href="https://www.ssb.no">SSB</a>', minZoom: 0, maxZoom: 20, tiled: true, version: "1.3.0",
    } as any);
    layerConfigs.push({ id: "tettsteder", name: "Tettsteder (SSB)", layer: tettstederLayer, enabled: false, icon: "users" });

    // Tensio luftnett (WMS) — kun for Tensio og underavdelinger
    if (isTensioHierarchy) {
      tensioLuftnettLayer = L.tileLayer.wms(TENSIO_WMS_URL, {
        layers: "0,1,2,3,4,5,6,7,8,9",
        format: "image/png",
        transparent: true,
        opacity: 0.75,
        attribution: "Tensio luftnett",
        version: "1.3.0",
        pane: "tensioPowerPane",
      } as any).addTo(map);
      layerConfigs.push({ id: "tensio_luftnett", name: "Luftnett Tensio", layer: tensioLuftnettLayer, enabled: true, icon: "zap" });
    }

    // NVE Kraftledninger (vector via ArcGIS REST)
    const kraftledningerLayer = L.layerGroup();
    layerConfigs.push({ id: "kraftledninger", name: "Kraftledninger (NVE)", layer: kraftledningerLayer, enabled: false, icon: "zap" });

    // NAIS skipstrafikk (BarentsWatch)
    if (!map.getPane('naisPane')) {
      map.createPane('naisPane');
      map.getPane('naisPane')!.style.zIndex = '695';
    }
    const naisLayer = L.layerGroup();
    layerConfigs.push({ id: "nais", name: "Skipstrafikk (NAIS)", layer: naisLayer, enabled: false, icon: "navigation" });

    // RPAS, NSM, AIP, RMZ layers — added to map BEFORE NOTAM for correct DOM order
    const rpasLayer = L.layerGroup().addTo(map);
    layerConfigs.push({ id: "rpas", name: "RPAS 5km soner", layer: rpasLayer, enabled: true, icon: "radio" });

    const nsmLayer = L.layerGroup().addTo(map);
    layerConfigs.push({ id: "nsm", name: "NSM Forbudsområder", layer: nsmLayer, enabled: true, icon: "ban" });

    const aipLayer = L.layerGroup();
    layerConfigs.push({ id: "aip", name: "Fareområder (P/R/D)", layer: aipLayer, enabled: false, icon: "shield" });

    const rmzTmzAtzLayer = L.layerGroup().addTo(map);
    layerConfigs.push({ id: "rmz_tmz_atz", name: "RMZ / TMZ / ATZ", layer: rmzTmzAtzLayer, enabled: true, icon: "radio" });

    // Live NOTAM — added AFTER all airspace layers so it renders on top in DOM
    const notamLayer = L.layerGroup().addTo(map);
    layerConfigs.push({ id: "notam", name: "Live Notam (test)", layer: notamLayer, enabled: true, icon: "alertTriangle" });

    const obstaclesLayer = L.layerGroup();
    layerConfigs.push({ id: "obstacles", name: "Hindringer (OpenAIP)", layer: obstaclesLayer, enabled: false, icon: "alertTriangle" });

    const airportsLayer = L.layerGroup().addTo(map);
    layerConfigs.push({ id: "airports", name: "Flyplasser", layer: airportsLayer, enabled: true, icon: "planeLanding" });

    // Geolocation
    if (!initialCenter && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const coords: [number, number] = [pos.coords.latitude, pos.coords.longitude];
          if (userMarkerRef.current) {
            userMarkerRef.current.setLatLng(coords);
          } else {
            userMarkerRef.current = L.circleMarker(coords, {
              radius: 8, fillColor: '#3b82f6', fillOpacity: 1, color: '#ffffff', weight: 2,
            }).addTo(map);
            userMarkerRef.current.bindPopup("Din posisjon");
          }
          // Bare sentrer kartet hvis vi IKKE har en flight å fokusere på
          if (!focusFlightIdRef.current) {
            map.setView(coords, 9);
          }
        },
        () => {
          console.log("Geolokasjon nektet");
          if (!focusFlightIdRef.current && companyLat && companyLon) {
            map.setView([companyLat, companyLon], 10);
          }
        },
      );
    }

    // Drone, Missions, SafeSky, Route, Pilot, Advisory layers
    const droneLayer = L.layerGroup().addTo(map);
    layerConfigs.push({ id: "drones", name: "Droner (live)", layer: droneLayer, enabled: true, icon: "navigation" });

    const missionsLayer = L.layerGroup();
    if (modeRef.current === "view") missionsLayer.addTo(map);
    missionsLayerRef.current = missionsLayer;
    layerConfigs.push({ id: "missions", name: "Oppdrag", layer: missionsLayer, enabled: modeRef.current === "view", icon: "mapPin" });

    const completedMissionsLayer = L.layerGroup();
    layerConfigs.push({ id: "completed_missions", name: "Utførte oppdrag", layer: completedMissionsLayer, enabled: false, icon: "mapPin" });

    const safeskyLayer = L.layerGroup().addTo(map);
    layerConfigs.push({ id: "safesky", name: "Lufttrafikk (live)", layer: safeskyLayer, enabled: true, icon: "radar" });

    const routeLayer = L.layerGroup().addTo(map);
    routeLayerRef.current = routeLayer;

    const pilotLayer = L.layerGroup().addTo(map);
    pilotLayerRef.current = pilotLayer;

    const activeAdvisoryLayer = L.layerGroup().addTo(map);
    const pilotPositionsLayer = L.layerGroup().addTo(map);

    setLayers(layerConfigs);

    // Common fetch params
    const geoJsonParams = {
      mode,
      setGeoJsonInteractivity,
      modeRef,
    };

    // Map click handler
    const handleMapClick = async (e: any) => {
      if (e.originalEvent?.target?.closest('.leaflet-marker-icon, .leaflet-popup, .leaflet-popup-content-wrapper')) return;
      
      const { lat, lng } = e.latlng;
      
      if (isPlacingPilotRef.current) {
        const cb = onPilotPositionChangeRef.current;
        if (cb) cb({ lat, lng });
        return;
      }
      
      if (modeRef.current === "routePlanning") {
        routePointsRef.current.push({ lat, lng });
        setRoutePointCount(routePointsRef.current.length);
        updateRouteDisplay();
        const cb = onRouteChangeRef.current;
        if (cb) {
          const coords = [...routePointsRef.current];
          cb({ coordinates: coords, totalDistance: calculateTotalDistance(coords), areaKm2: calculatePolygonAreaKm2(coords) });
        }
      } else if (weatherEnabledRef.current) {
        showWeatherPopup(map, lat, lng);
      } else if (isTensioHierarchy && tensioLuftnettLayer && map.hasLayer(tensioLuftnettLayer)) {
        try {
          const response = await fetch(buildTensioFeatureInfoUrl(map, e.latlng));
          if (!response.ok) return;
          const data = await response.json();
          const feature = data?.features?.find((item: any) => item?.properties && Object.keys(item.properties).length > 0);
          if (feature?.properties) {
            L.popup({ maxWidth: 300 })
              .setLatLng(e.latlng)
              .setContent(formatFeatureInfoPopup("Luftnett Tensio", feature.properties))
              .openOn(map);
          }
        } catch (err) {
          try {
            const fallback = await fetch(buildTensioFeatureInfoUrl(map, e.latlng, "text/plain"));
            const popup = fallback.ok ? formatPlainFeatureInfoPopup("Luftnett Tensio", await fallback.text()) : "";
            if (popup) L.popup({ maxWidth: 300 }).setLatLng(e.latlng).setContent(popup).openOn(map);
          } catch (fallbackErr) {
            console.warn("Kunne ikke hente Tensio objektinformasjon:", fallbackErr);
          }
        }
      }
    };

    map.on('click', handleMapClick);

    // Heartbeat is now handled globally by useAppHeartbeat hook

    // SafeSky manager
    const safeSkyManager = createSafeSkyManager({ safeskyLayer, mode });
    (map as any)._safeskyControls = { start: safeSkyManager.start, stop: safeSkyManager.stop };

    // Start ALL layers immediately — AuthContext handles session validity,
    // Supabase SDK auto-attaches the JWT from localStorage for RLS queries.
    safeSkyManager.start();
    fetchNsmData({ ...geoJsonParams, layer: nsmLayer, geoJsonRef: nsmGeoJsonRef });
    fetchRpasData({ ...geoJsonParams, layer: rpasLayer, geoJsonRef: rpasGeoJsonRef });
    fetchAllAipZones({ ...geoJsonParams, layer: aipLayer, aipLayer, rmzTmzAtzLayer, aipGeoJsonLayersRef });
    fetchObstacles({ layer: obstaclesLayer, mode });
    fetchAirportsData({ layer: airportsLayer, mode });
    fetchDroneTelemetry({ droneLayer, modeRef });
    fetchAndDisplayMissions({ missionsLayer, completedMissionsLayer, modeRef, onMissionClickRef });
    fetchActiveAdvisories({ activeAdvisoryLayer, flightMarkersRef });
    fetchPilotPositions({ pilotPositionsLayer, flightMarkersRef, mode });
    fetchNotams({ layer: notamLayer, pane: 'notamPane', pinPane: 'notamPinPane', mode });
    // Viewport-based verneområder fetching with debounce
    const fetchVerneomraader = () => {
      if (map.getZoom() < 10) {
        naturvernLayer.clearLayers();
        return;
      }
      const b = map.getBounds();
      const bounds = {
        minLat: b.getSouth(),
        minLng: b.getWest(),
        maxLat: b.getNorth(),
        maxLng: b.getEast(),
      };
      naturvernLayer.clearLayers();
      fetchNaturvernZones({ layer: naturvernLayer, mode, bounds });
      fetchVernRestrictionZones({ layer: naturvernLayer, mode, bounds });
    };

    let vernDebounceTimer: ReturnType<typeof setTimeout> | null = null;
    const debouncedFetchVern = () => {
      if (vernDebounceTimer) clearTimeout(vernDebounceTimer);
      vernDebounceTimer = setTimeout(fetchVerneomraader, 300);
    };

    // Initial fetch + listen for map moves
    fetchVerneomraader();
    map.on('moveend', debouncedFetchVern);

    // Kraftledninger: refetch on moveend if layer is enabled
    let kraftDebounceTimer: ReturnType<typeof setTimeout> | null = null;
    const debouncedFetchKraft = () => {
      if (kraftDebounceTimer) clearTimeout(kraftDebounceTimer);
      kraftDebounceTimer = setTimeout(() => {
        // Check if layer is currently enabled
        const isEnabled = kraftledningerLayer && (map.hasLayer(kraftledningerLayer));
        if (isEnabled) {
          fetchKraftledningerInBounds({
            layer: kraftledningerLayer,
            bounds: map.getBounds(),
            zoom: map.getZoom(),
            pane: 'powerPane',
            mode: modeRef.current,
          });
        }
      }, 500);
    };
    map.on('moveend', debouncedFetchKraft);

    // NAIS: refetch on moveend if layer is enabled
    let naisDebounceTimer: ReturnType<typeof setTimeout> | null = null;
    const debouncedFetchNais = () => {
      if (naisDebounceTimer) clearTimeout(naisDebounceTimer);
      naisDebounceTimer = setTimeout(() => {
        const isEnabled = naisLayer && map.hasLayer(naisLayer);
        if (isEnabled) {
          fetchAisVesselsInBounds({
            layer: naisLayer,
            bounds: map.getBounds(),
            zoom: map.getZoom(),
            pane: 'naisPane',
            mode: modeRef.current,
          });
        }
      }, 500);
    };
    map.on('moveend', debouncedFetchNais);

    // NOTAM: refetch on moveend if layer is enabled

    const droneInterval = setInterval(() => fetchDroneTelemetry({ droneLayer, modeRef }), 15000);

    // Real-time subscriptions
    const mapChannel = supabase
      .channel('kart-main')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'missions' }, () => fetchAndDisplayMissions({ missionsLayer, completedMissionsLayer, modeRef, onMissionClickRef }))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'drone_telemetry' }, () => fetchDroneTelemetry({ droneLayer, modeRef }))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'active_flights' }, () => {
        fetchActiveAdvisories({ activeAdvisoryLayer, flightMarkersRef });
        fetchPilotPositions({ pilotPositionsLayer, flightMarkersRef, mode });
      })
      .subscribe();

    // Visibility change handler — refresh map when returning from background
    let lastHiddenAt = 0;
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        lastHiddenAt = Date.now();
        return;
      }
      // Only refresh if tab was hidden for > 5 seconds
      if (document.visibilityState === 'visible' && lastHiddenAt > 0 && Date.now() - lastHiddenAt > 5000) {
        console.log('Map: tab returned after background, refreshing layers');
        
        // 1. Force Leaflet to recalculate container and re-render tiles
        map.invalidateSize();
        
        // 2. Restart SafeSky (stop clears stale intervals, start re-triggers warm-up)
        safeSkyManager.stop();
        safeSkyManager.start();
        
        // 4. Re-fetch ALL data layers (including RLS-protected ones)
        fetchNsmData({ ...geoJsonParams, layer: nsmLayer, geoJsonRef: nsmGeoJsonRef });
        fetchRpasData({ ...geoJsonParams, layer: rpasLayer, geoJsonRef: rpasGeoJsonRef });
        fetchAllAipZones({ ...geoJsonParams, layer: aipLayer, aipLayer, rmzTmzAtzLayer, aipGeoJsonLayersRef });
        fetchObstacles({ layer: obstaclesLayer, mode });
        fetchAirportsData({ layer: airportsLayer, mode });
        fetchAndDisplayMissions({ missionsLayer, completedMissionsLayer, modeRef, onMissionClickRef });
        fetchDroneTelemetry({ droneLayer, modeRef });
        fetchActiveAdvisories({ activeAdvisoryLayer, flightMarkersRef });
        fetchPilotPositions({ pilotPositionsLayer, flightMarkersRef, mode });
        fetchVerneomraader();
        
        // 5. Check realtime channel state and resubscribe if needed
        if ((mapChannel as any).state !== 'joined') {
          console.log('Map: realtime channel disconnected, resubscribing');
          mapChannel.subscribe();
        }
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      clearInterval(droneInterval);
      if (vernDebounceTimer) clearTimeout(vernDebounceTimer);
      if (kraftDebounceTimer) clearTimeout(kraftDebounceTimer);
      if (naisDebounceTimer) clearTimeout(naisDebounceTimer);
      
      map.off('moveend', debouncedFetchVern);
      map.off('moveend', debouncedFetchKraft);
      map.off('moveend', debouncedFetchNais);
      populationDensityRendererRef.current = null;
      
      safeSkyManager.cleanup();
      map.off("click");
      mapChannel.unsubscribe();
      map.remove();
    };
  }, [profileLoaded, isTensioHierarchy]);

  // Recenter map when initialCenter changes
  useEffect(() => {
    if (initialCenter && leafletMapRef.current) {
      leafletMapRef.current.setView(initialCenter, 13);
    }
  }, [initialCenter]);

  // Display existing route
  useEffect(() => {
    if (existingRoute && existingRoute.coordinates.length > 0) {
      routePointsRef.current = [...existingRoute.coordinates];
      updateRouteDisplay();
    }
  }, [existingRoute, updateRouteDisplay]);

  // Focus on specific flight
  useEffect(() => {
    if (!focusFlightId || !leafletMapRef.current) return;

    const timer = setTimeout(() => {
      const marker = flightMarkersRef.current.get(focusFlightId);
      if (marker) {
        const latlng = marker.getLatLng();
        leafletMapRef.current?.setView(latlng, 14, { animate: true });
        marker.openPopup();
      } else {
        supabase
          .from('active_flights')
          .select('start_lat, start_lng, publish_mode, route_data')
          .eq('id', focusFlightId)
          .maybeSingle()
          .then(({ data }) => {
            if (!data || !leafletMapRef.current) return;
            if (data.start_lat && data.start_lng) {
              leafletMapRef.current.setView([data.start_lat, data.start_lng], 14, { animate: true });
            } else if (data.route_data) {
              const rd = data.route_data as any;
              if (rd.coordinates?.length > 0) {
                const centLat = rd.coordinates.reduce((s: number, c: any) => s + c.lat, 0) / rd.coordinates.length;
                const centLng = rd.coordinates.reduce((s: number, c: any) => s + c.lng, 0) / rd.coordinates.length;
                leafletMapRef.current.setView([centLat, centLng], 13, { animate: true });
              }
            }
          });
      }
      onFocusFlightHandled?.();
    }, 300);

    return () => clearTimeout(timer);
  }, [focusFlightId, onFocusFlightHandled]);

  // Pilot position marker and VLOS circle
  useEffect(() => {
    if (!pilotLayerRef.current || !leafletMapRef.current) return;
    
    pilotLayerRef.current.clearLayers();
    pilotMarkerRef.current = null;
    pilotCircleRef.current = null;
    
    if (!pilotPosition) return;
    
    const VLOS_RADIUS = pilotVlosRadiusM && pilotVlosRadiusM > 0 ? Math.round(pilotVlosRadiusM) : 120;
    const alosLine = pilotAlosCalculation
      ? `<br/><span style="font-size: 12px;">ALOS: ${pilotAlosCalculation}</span>`
      : `<br/><span style="font-size: 11px; color: #999;">(standard 120 m – velg drone i SORA for ALOS)</span>`;
    
    const pilotIcon = L.divIcon({
      className: '',
      html: `<div style="
        width: 36px; height: 36px; background: #8b5cf6;
        border: 3px solid white; border-radius: 50%;
        display: flex; align-items: center; justify-content: center;
        box-shadow: 0 2px 8px rgba(0,0,0,0.4);
      ">
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="8" r="5"/><path d="M20 21a8 8 0 0 0-16 0"/>
        </svg>
      </div>`,
      iconSize: [36, 36],
      iconAnchor: [18, 18],
      popupAnchor: [0, -18],
    });
    
    const marker = L.marker([pilotPosition.lat, pilotPosition.lng], { 
      icon: pilotIcon, draggable: mode === 'routePlanning', pane: 'routePane',
    });
    
    marker.bindPopup(`<div><strong>👤 Pilotposisjon</strong><br/><span style="font-size: 11px; color: #666;">Dra for å flytte</span><br/><span style="font-size: 12px;">VLOS-radius: ${VLOS_RADIUS}m</span>${alosLine}</div>`);
    
    if (mode === 'routePlanning') {
      marker.on('dragend', (e: any) => {
        const { lat, lng } = e.target.getLatLng();
        const cb = onPilotPositionChangeRef.current;
        if (cb) cb({ lat, lng });
      });
    }
    
    marker.addTo(pilotLayerRef.current);
    pilotMarkerRef.current = marker;
    
    const circle = L.circle([pilotPosition.lat, pilotPosition.lng], {
      radius: VLOS_RADIUS, color: '#8b5cf6', weight: 2, fillColor: '#8b5cf6',
      fillOpacity: 0.1, dashArray: '5, 5', pane: 'routePane',
    });
    circle.addTo(pilotLayerRef.current);
    pilotCircleRef.current = circle;
  }, [pilotPosition, mode, pilotVlosRadiusM, pilotAlosCalculation]);

  const handleLayerToggle = (id: string, enabled: boolean) => {
    const map = leafletMapRef.current;
    if (!map) return;
    
    if (id === 'safesky') {
      const controls = (map as any)._safeskyControls;
      if (controls) {
        if (enabled) controls.start();
        else controls.stop();
      }
    }

    // Kraftledninger: fetch data on enable, clear on disable
    if (id === 'kraftledninger') {
      setLayers((prevLayers) =>
        prevLayers.map((layer) => {
          if (layer.id === id) {
            if (enabled) {
              layer.layer.addTo(map);
              fetchKraftledningerInBounds({
                layer: layer.layer as L.LayerGroup,
                bounds: map.getBounds(),
                zoom: map.getZoom(),
                pane: 'powerPane',
                mode: modeRef.current,
              });
            } else {
              (layer.layer as L.LayerGroup).clearLayers();
              layer.layer.remove();
            }
            return { ...layer, enabled };
          }
          return layer;
        })
      );
      return;
    }

    // NAIS skipstrafikk: fetch data on enable, clear on disable
    if (id === 'nais') {
      setLayers((prevLayers) =>
        prevLayers.map((layer) => {
          if (layer.id === id) {
            if (enabled) {
              layer.layer.addTo(map);
              fetchAisVesselsInBounds({
                layer: layer.layer as L.LayerGroup,
                bounds: map.getBounds(),
                zoom: map.getZoom(),
                pane: 'naisPane',
                mode: modeRef.current,
              });
            } else {
              (layer.layer as L.LayerGroup).clearLayers();
              layer.layer.remove();
            }
            return { ...layer, enabled };
          }
          return layer;
        })
      );
      return;
    }
    
    setLayers((prevLayers) =>
      prevLayers.map((layer) => {
        if (layer.id === id) {
          if (enabled) layer.layer.addTo(map);
          else layer.layer.remove();
          return { ...layer, enabled };
        }
        return layer;
      })
    );
  };

  const clearRoute = useCallback(() => {
    routePointsRef.current = [];
    setRoutePointCount(0);
    updateRouteDisplay();
    if (onRouteChange) onRouteChange({ coordinates: [], totalDistance: 0 });
  }, [updateRouteDisplay, onRouteChange]);

  const undoLastPoint = useCallback(() => {
    if (routePointsRef.current.length > 0) {
      routePointsRef.current.pop();
      setRoutePointCount(routePointsRef.current.length);
      updateRouteDisplay();
      if (onRouteChange) {
        const coords = [...routePointsRef.current];
        onRouteChange({ coordinates: coords, totalDistance: calculateTotalDistance(coords), areaKm2: calculatePolygonAreaKm2(coords) });
      }
    }
  }, [updateRouteDisplay, onRouteChange]);

  return (
    <div className="relative w-full h-full overflow-hidden touch-manipulation select-none">
      <div ref={mapRef} className="w-full h-full touch-manipulation" />
      
      <div className="absolute top-4 right-4 z-[1050] flex flex-col gap-2">
        <Button
          variant={weatherEnabled ? "default" : "secondary"}
          size="icon"
          className={`shadow-lg ${weatherEnabled ? "" : "bg-card hover:bg-accent"}`}
          onClick={() => { if (mode !== "view") return; setWeatherEnabled(!weatherEnabled); }}
          disabled={mode !== "view"}
          title={mode !== "view" ? "Værvisning er ikke tilgjengelig under ruteplanlegging" : weatherEnabled ? "Slå av værvisning" : "Slå på værvisning (klikk i kartet)"}
        >
          <CloudSun className="h-5 w-5" />
        </Button>

        <Button
          variant="secondary"
          size="icon"
          className="shadow-lg bg-card hover:bg-accent"
          onClick={() => {
            const next = baseLayerType === "osm" ? "satellite" : baseLayerType === "satellite" ? "topo" : "osm";
            switchBaseLayer(next);
          }}
          title={baseLayerType === "osm" ? "Bytt til satellittkart" : baseLayerType === "satellite" ? "Bytt til topografisk kart" : "Bytt til standard kart"}
        >
          {baseLayerType === "osm" ? <Satellite className="h-5 w-5" /> : baseLayerType === "satellite" ? <Mountain className="h-5 w-5" /> : <MapIcon className="h-5 w-5" />}
        </Button>

        <MapLayerControl layers={layers} onLayerToggle={handleLayerToggle} />

        {mode === "view" && onStartRoutePlanning && (
          <Button onClick={onStartRoutePlanning} variant="default" size="icon" className="shadow-lg" title="Planlegg ny rute">
            <Route className="h-5 w-5" />
          </Button>
        )}
      </div>

      {mode === "view" && weatherEnabled && (
        <div className="absolute top-14 left-1/2 -translate-x-1/2 bg-background/95 backdrop-blur-sm px-4 py-2 rounded-lg shadow-lg border border-border z-[1000] text-sm">
          <span className="text-muted-foreground">Klikk på kartet for å se værdata</span>
        </div>
      )}

      {mode === "routePlanning" && routePointCount === 0 && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-background/95 backdrop-blur-sm px-4 py-2 rounded-lg shadow-lg border border-border z-[1000] text-sm">
          <span className="text-muted-foreground">Klikk på kartet for å legge til punkter</span>
        </div>
      )}

      {layers.find(l => l.id === "arealbruk")?.enabled && <ArealbrukLegend />}
      {layers.find(l => l.id === "befolkning1km")?.enabled ? (
        <BefolkningLegend resolution="1km" />
      ) : null}
      {layers.find(l => l.id === "tettsteder")?.enabled && <TettstederLegend />}
    </div>
  );
}
