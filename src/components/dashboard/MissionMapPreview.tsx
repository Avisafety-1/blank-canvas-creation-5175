import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { fetchTerrainElevations } from "@/lib/terrainElevation";
import { renderSoraZones } from "@/lib/soraGeometry";
import { getAipZones } from "@/lib/aipZoneCache";

interface RoutePoint {
  lat: number;
  lng: number;
}

interface SoraSettings {
  enabled: boolean;
  flightAltitude: number;
  contingencyDistance: number;
  contingencyHeight: number;
  groundRiskDistance: number;
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

interface MissionMapPreviewProps {
  latitude: number;
  longitude: number;
  route?: RouteData | null;
  flightTracks?: FlightTrack[] | null;
  notam?: NotamData | null;
}

export const MissionMapPreview = ({ latitude, longitude, route, flightTracks, notam }: MissionMapPreviewProps) => {
  const mapRef = useRef<HTMLDivElement | null>(null);
  const leafletMapRef = useRef<L.Map | null>(null);
  const terrainElevationsRef = useRef<globalThis.Map<string, number>>(new globalThis.Map());
  const [isVisible, setIsVisible] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Lazy-load: only initialize map when scrolled into view
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: '200px' }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!isVisible || !mapRef.current || !latitude || !longitude) return;

    let isMounted = true;

    const map = L.map(mapRef.current, {
      zoomControl: true,
      scrollWheelZoom: false,
    }).setView([latitude, longitude], 11);
    
    leafletMapRef.current = map;

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; OpenStreetMap contributors',
    }).addTo(map);

    // Mission marker
    const icon = L.divIcon({
      className: '',
      html: `<div style="
        width: 40px; height: 40px; display: flex; align-items: center; justify-content: center;
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

    L.marker([latitude, longitude], { icon }).addTo(map).bindPopup("Oppdragsposisjon");

    const allPoints: [number, number][] = [[latitude, longitude]];

    // SORA zones
    const soraLayer = L.layerGroup().addTo(map);
    if (route?.soraSettings) {
      const validCoords = (route.coordinates ?? []).filter(
        p => p != null && typeof p.lat === 'number' && isFinite(p.lat) && typeof p.lng === 'number' && isFinite(p.lng)
      );
      if (validCoords.length >= 1) {
        renderSoraZones(validCoords, { flightGeographyDistance: 0, ...route.soraSettings }, soraLayer);
      }
    }

    // Planned route
    if (route?.coordinates && route.coordinates.length > 0) {
      const routeLayer = L.layerGroup().addTo(map);
      if (route.coordinates.length > 1) {
        const latLngs = route.coordinates.map(p => [p.lat, p.lng] as [number, number]);
        L.polyline(latLngs, { color: '#3b82f6', weight: 3, opacity: 0.8, dashArray: '10, 5' }).addTo(routeLayer);
        latLngs.forEach(ll => allPoints.push(ll));
      }
      route.coordinates.forEach((point, index) => {
        const isFirst = index === 0;
        const isLast = index === route.coordinates.length - 1 && route.coordinates.length > 1;
        let bgColor = '#3b82f6';
        if (isFirst) bgColor = '#22c55e';
        else if (isLast) bgColor = '#ef4444';
        L.marker([point.lat, point.lng], {
          icon: L.divIcon({
            className: '',
            html: `<div style="width:24px;height:24px;background:${bgColor};border:2px solid white;border-radius:50%;display:flex;align-items:center;justify-content:center;color:white;font-weight:bold;font-size:11px;box-shadow:0 2px 6px rgba(0,0,0,0.3);">${index + 1}</div>`,
            iconSize: [24, 24],
            iconAnchor: [12, 12],
          }),
        }).addTo(routeLayer);
      });
    }

    // Flight tracks
    if (flightTracks && flightTracks.length > 0) {
      if (!map.getPane('flightTrackPane')) {
        map.createPane('flightTrackPane');
        map.getPane('flightTrackPane')!.style.zIndex = '700';
        map.getPane('popupPane')!.style.zIndex = '800';
      }
      const tracksLayer = L.layerGroup().addTo(map);
      const allTrackPositions = flightTracks.flatMap(t => t.positions || []);
      fetchTerrainElevations(allTrackPositions).then((elevations) => {
        if (!isMounted) return;
        allTrackPositions.forEach((pos, i) => {
          if (elevations[i] != null) {
            terrainElevationsRef.current.set(`${pos.lat.toFixed(6)},${pos.lng.toFixed(6)}`, elevations[i]!);
          }
        });
      }).catch(() => {});

      flightTracks.forEach((track, trackIndex) => {
        if (!track.positions || track.positions.length < 2) return;
        const latLngs = track.positions.map(p => [p.lat, p.lng] as [number, number]);
        const trackLine = L.polyline(latLngs, { color: '#22c55e', weight: 5, opacity: 0.9, pane: 'flightTrackPane' }).addTo(tracksLayer);
        latLngs.forEach(ll => allPoints.push(ll));

        trackLine.on('click', (e: L.LeafletMouseEvent) => {
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
          const content = `<div style="font-size:12px;line-height:1.5">
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

        const startPos = track.positions[0];
        L.circleMarker([startPos.lat, startPos.lng], {
          radius: 8, fillColor: '#22c55e', color: '#fff', weight: 2, fillOpacity: 1, pane: 'flightTrackPane',
        }).addTo(tracksLayer).bindPopup(`Flytur ${trackIndex + 1} - Start`);

        const endPos = track.positions[track.positions.length - 1];
        L.circleMarker([endPos.lat, endPos.lng], {
          radius: 8, fillColor: '#f97316', color: '#fff', weight: 2, fillOpacity: 1, pane: 'flightTrackPane',
        }).addTo(tracksLayer).bindPopup(`Flytur ${trackIndex + 1} - Slutt`);
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
      map.fitBounds(bounds, { padding: [30, 30], maxZoom: 18 });
    }

    // Airspace zones — external APIs + shared AIP cache
    const zonesLayer = L.layerGroup().addTo(map);

    async function fetchZones() {
      if (!isMounted) return;
      try {
        const [nsmResponse, rpasResponse, ctrResponse] = await Promise.all([
          fetch("https://services9.arcgis.com/qCxEdsGu1A7NwfY1/ArcGIS/rest/services/Forbudsomr%c3%a5derNSM_v/FeatureServer/0/query?where=1%3D1&outFields=*&outSR=4326&f=geojson"),
          fetch("https://services.arcgis.com/a8CwScMFSS2ljjgn/ArcGIS/rest/services/RPAS_AVIGIS1/FeatureServer/0/query?where=1%3D1&outFields=*&outSR=4326&f=geojson"),
          fetch("https://services.arcgis.com/a8CwScMFSS2ljjgn/ArcGIS/rest/services/RPAS_CTR_TIZ/FeatureServer/0/query?where=1%3D1&outFields=*&outSR=4326&f=geojson"),
        ]);

        if (nsmResponse.ok && isMounted) {
          const nsmData = await nsmResponse.json();
          L.geoJSON(nsmData, {
            style: { color: '#ef4444', weight: 2, fillColor: '#ef4444', fillOpacity: 0.15 },
            onEachFeature: (feature, layer) => {
              const name = feature.properties?.navn || feature.properties?.name || 'NSM Forbudsområde';
              layer.bindPopup(`<strong>NSM</strong><br/>${name}`);
            }
          }).addTo(zonesLayer);
        }

        if (rpasResponse.ok && isMounted) {
          const rpasData = await rpasResponse.json();
          L.geoJSON(rpasData, {
            style: { color: '#f97316', weight: 2, fillColor: '#f97316', fillOpacity: 0.15 },
            onEachFeature: (feature, layer) => {
              const name = feature.properties?.navn || feature.properties?.name || 'RPAS 5km sone';
              layer.bindPopup(`<strong>RPAS 5km</strong><br/>${name}`);
            }
          }).addTo(zonesLayer);
        }

        if (ctrResponse.ok && isMounted) {
          const ctrData = await ctrResponse.json();
          L.geoJSON(ctrData, {
            style: { color: '#ec4899', weight: 2, fillColor: '#ec4899', fillOpacity: 0.15 },
            onEachFeature: (feature, layer) => {
              const name = feature.properties?.navn || feature.properties?.name || 'CTR/TIZ';
              layer.bindPopup(`<strong>RPAS CTR/TIZ</strong><br/>${name}`);
            }
          }).addTo(zonesLayer);
        }

        // AIP zones from shared cache (eliminates N+1)
        try {
          const aipZones = await getAipZones();
          if (!isMounted) return;
          for (const zone of aipZones) {
            if (!zone.geometry || !isMounted) continue;
            let color = '#f59e0b';
            let label = 'Fareområde';
            let dashArray: string | undefined = undefined;
            if (zone.zone_type === 'P') { color = '#dc2626'; label = 'Forbudsområde'; }
            else if (zone.zone_type === 'R') { color = '#8b5cf6'; label = 'Restriksjonsområde'; }
            else if (zone.zone_type === 'D') { dashArray = '5, 5'; }
            else if (zone.zone_type === 'RMZ') { color = '#22c55e'; label = 'RMZ'; dashArray = '8, 6'; }
            else if (zone.zone_type === 'TMZ') { color = '#06b6d4'; label = 'TMZ'; dashArray = '8, 6'; }
            else if (zone.zone_type === 'ATZ') { color = '#38bdf8'; label = 'ATZ'; }
            else if (zone.zone_type === 'CTR') { color = '#ec4899'; label = 'CTR'; }
            else if (zone.zone_type === 'TIZ') { color = '#a78bfa'; label = 'TIZ'; dashArray = '8, 6'; }

            try {
              L.geoJSON({ type: 'Feature', geometry: zone.geometry, properties: {} } as any, {
                style: { color, weight: 2, fillColor: color, fillOpacity: 0.15, dashArray },
                onEachFeature: (_feature, layer) => {
                  const displayName = zone.name || zone.zone_id || 'Ukjent';
                  layer.bindPopup(`<strong>${label}</strong><br/><strong>${displayName}</strong><br/>${zone.upper_limit ? 'Øvre: ' + zone.upper_limit : ''}`);
                }
              }).addTo(zonesLayer);
            } catch {}
          }
        } catch (err) {
          console.error("Feil ved henting av AIP-soner:", err);
        }
      } catch (err) {
        console.error("Feil ved henting av luftromssoner:", err);
      }
    }

    fetchZones();

    return () => {
      isMounted = false;
      try {
        map.stop();
        map.remove();
      } catch {
        // Suppress Leaflet _leaflet_pos errors during rapid unmount
      }
    };
  }, [isVisible, latitude, longitude, route, flightTracks, notam]);

  return (
    <div ref={containerRef} className="relative w-full h-full rounded-lg overflow-hidden border border-border">
      {isVisible ? (
        <div ref={mapRef} className="absolute inset-0" />
      ) : (
        <div className="absolute inset-0 bg-muted animate-pulse" />
      )}
    </div>
  );
};
