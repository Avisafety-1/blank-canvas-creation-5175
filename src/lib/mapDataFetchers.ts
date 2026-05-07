import L from "leaflet";
import { supabase } from "@/integrations/supabase/client";
import { droneAnimatedIcon } from "@/lib/mapIcons";
import airportIcon from "@/assets/airport-icon.png";

interface FetchParams {
  layer: L.LayerGroup;
  mode: string;
  pane?: string;
}

interface GeoJsonFetchParams extends FetchParams {
  geoJsonRef?: React.MutableRefObject<L.GeoJSON<any> | null>;
  aipGeoJsonLayersRef?: React.MutableRefObject<L.GeoJSON[]>;
  setGeoJsonInteractivity: (geoJson: L.GeoJSON<any> | null, enabled: boolean) => void;
  modeRef: React.MutableRefObject<string>;
}

export async function fetchNsmData(params: GeoJsonFetchParams) {
  const { layer, mode, geoJsonRef, setGeoJsonInteractivity, modeRef } = params;
  try {
    const url = "https://services9.arcgis.com/qCxEdsGu1A7NwfY1/ArcGIS/rest/services/Forbudsomr%c3%a5derNSM_v/FeatureServer/0/query?where=1%3D1&outFields=*&outSR=4326&f=geojson";
    const response = await fetch(url);
    if (!response.ok) return;

    const geojson = await response.json();
    const geoJsonLayer = L.geoJSON(geojson, {
      pane: 'nsmPane',
      interactive: mode !== 'routePlanning',
      style: {
        color: '#ff0000',
        weight: 2,
        fillColor: '#ff0000',
        fillOpacity: 0.25,
      },
      onEachFeature: mode !== 'routePlanning' ? (feature, layer) => {
        const props = feature?.properties || {};
        const name =
          props.navn || props.NAVN || props.name || props.Name ||
          props.OMR_NAVN || props.OMRNAVN || props.OBJECTID || 'Ukjent område';

        const excludeKeys = ['globalid', 'shape_area', 'shape__area', 'shape_length', 'shape__length', 'shape_lenght', 'objectid', 'refnr', 'length'];
        const details = Object.entries(props)
          .filter(([k, v]) => v !== null && v !== undefined && String(v).trim() !== '' && !excludeKeys.includes(k.trim().toLowerCase()))
          .slice(0, 8)
          .map(([k, v]) => `<div style="font-size: 11px;"><span style="color:#666;">${k}:</span> ${String(v)}</div>`)
          .join('');

        layer.bindPopup(
          `<div>
            <strong>NSM Forbudsområde</strong><br/>
            <span>${String(name)}</span>
            ${details ? `<div style="margin-top:6px;">${details}</div>` : ''}
          </div>`
        );
      } : undefined,
    });

    if (geoJsonRef) {
      geoJsonRef.current = geoJsonLayer;
    }
    setGeoJsonInteractivity(geoJsonLayer, modeRef.current !== "routePlanning");
    (geoJsonLayer as any).bringToFront?.();
    geoJsonLayer.eachLayer((l: any) => l?.bringToFront?.());

    layer.clearLayers();
    layer.addLayer(geoJsonLayer);
  } catch (err) {
    console.error("Kunne ikke hente NSM Forbudsområder:", err);
  }
}

export async function fetchRpasData(params: GeoJsonFetchParams) {
  const { layer, mode, geoJsonRef, setGeoJsonInteractivity, modeRef } = params;
  try {
    const url = "https://services.arcgis.com/a8CwScMFSS2ljjgn/ArcGIS/rest/services/RPAS_AVIGIS1/FeatureServer/0/query?where=1%3D1&outFields=*&outSR=4326&f=geojson";
    const response = await fetch(url);
    if (!response.ok) return;
    
    const geojson = await response.json();
    const geoJsonLayer = L.geoJSON(geojson, {
      interactive: mode !== 'routePlanning',
      pane: 'rpasPane',
      style: {
        color: '#f97316',
        weight: 2,
        fillColor: '#f97316',
        fillOpacity: 0.2,
      },
      onEachFeature: mode !== 'routePlanning' ? (feature, layer) => {
        if (feature.properties) {
          const name = feature.properties.navn || feature.properties.name || 'Ukjent';
          layer.bindPopup(`<strong>RPAS 5km sone</strong><br/>${name}`);
        }
      } : undefined
    });

    if (geoJsonRef) {
      geoJsonRef.current = geoJsonLayer;
    }
    setGeoJsonInteractivity(geoJsonLayer, modeRef.current !== "routePlanning");
    
    layer.clearLayers();
    layer.addLayer(geoJsonLayer);
  } catch (err) {
    console.error("Kunne ikke hente RPAS 5km soner:", err);
  }
}

export async function fetchAllAipZones(params: GeoJsonFetchParams & {
  aipLayer: L.LayerGroup;
  rmzTmzAtzLayer: L.LayerGroup;
}) {
  const { aipLayer, rmzTmzAtzLayer, mode, aipGeoJsonLayersRef, setGeoJsonInteractivity, modeRef } = params;
  try {
    const { data, error } = await supabase
      .from('aip_restriction_zones')
      .select('zone_id, zone_type, name, upper_limit, lower_limit, remarks, geometry, properties')
      .in('zone_type', ['P', 'R', 'D', 'RMZ', 'TMZ', 'ATZ', 'CTR', 'TIZ'])
      .eq('is_official', true);

    if (error || !data) {
      console.error('Feil ved henting av AIP-soner:', error);
      return;
    }

    aipLayer.clearLayers();
    rmzTmzAtzLayer.clearLayers();
    if (aipGeoJsonLayersRef) {
      aipGeoJsonLayersRef.current = [];
    }

    const prdTypes = new Set(['P', 'R', 'D']);

    for (const zone of data) {
      if (!zone.geometry) continue;

      const isPRD = prdTypes.has(zone.zone_type);
      let color: string;
      let label: string;
      let dashArray: string | undefined;
      let fillOpacity: number;
      let pane: string;
      let targetLayer: L.LayerGroup;

      if (zone.zone_type === 'P') {
        color = '#dc2626'; label = 'Forbudsområde'; fillOpacity = 0.2; pane = 'aipPane'; targetLayer = aipLayer;
      } else if (zone.zone_type === 'R') {
        color = '#8b5cf6'; label = 'Restriksjonsområde'; fillOpacity = 0.2; pane = 'aipPane'; targetLayer = aipLayer;
      } else if (zone.zone_type === 'D') {
        color = '#f59e0b'; label = 'Fareområde'; dashArray = '5, 5'; fillOpacity = 0.2; pane = 'aipPane'; targetLayer = aipLayer;
      } else if (zone.zone_type === 'TMZ') {
        color = '#06b6d4'; label = 'TMZ (Transponder Mandatory Zone)'; dashArray = '8, 6'; fillOpacity = 0.12; pane = 'rmzPane'; targetLayer = rmzTmzAtzLayer;
      } else if (zone.zone_type === 'ATZ') {
        color = '#38bdf8'; label = 'ATZ (Aerodrome Traffic Zone)'; fillOpacity = 0.12; pane = 'rmzPane'; targetLayer = rmzTmzAtzLayer;
      } else if (zone.zone_type === 'CTR') {
        color = '#ec4899'; label = 'CTR (Control Zone)'; fillOpacity = 0.12; pane = 'rmzPane'; targetLayer = rmzTmzAtzLayer;
      } else if (zone.zone_type === 'TIZ') {
        color = '#a78bfa'; label = 'TIZ (Traffic Information Zone)'; dashArray = '8, 6'; fillOpacity = 0.12; pane = 'rmzPane'; targetLayer = rmzTmzAtzLayer;
      } else {
        // RMZ default
        color = '#22c55e'; label = 'RMZ (Radio Mandatory Zone)'; dashArray = '8, 6'; fillOpacity = 0.12; pane = 'rmzPane'; targetLayer = rmzTmzAtzLayer;
      }

      try {
        const geojsonFeature = {
          type: 'Feature' as const,
          geometry: zone.geometry,
          properties: {
            zone_id: zone.zone_id,
            zone_type: zone.zone_type,
            name: zone.name,
            upper_limit: zone.upper_limit,
            lower_limit: zone.lower_limit,
            remarks: zone.remarks,
          }
        };

        const geoJsonLayer = L.geoJSON(geojsonFeature as any, {
          interactive: mode !== 'routePlanning',
          pane,
          style: {
            color,
            weight: 2,
            fillColor: color,
            fillOpacity,
            dashArray,
          },
          onEachFeature: mode !== 'routePlanning' ? (feature, layer) => {
            const p = feature.properties || {};
            const displayName = p.name || p.zone_id || 'Ukjent';
            let popup = `<strong>${label}</strong><br/>`;
            popup += `<strong>${displayName}</strong><br/>`;
            if (p.upper_limit) popup += `Øvre grense: ${p.upper_limit}<br/>`;
            if (p.lower_limit) popup += `Nedre grense: ${p.lower_limit}<br/>`;
            if (p.remarks) popup += `<div style="font-size: 11px; margin-top: 4px; color: #666;">${p.remarks}</div>`;
            layer.bindPopup(popup);
          } : undefined,
        });
        geoJsonLayer.addTo(targetLayer);
        if (aipGeoJsonLayersRef) {
          aipGeoJsonLayersRef.current.push(geoJsonLayer);
        }
        if (modeRef.current === 'routePlanning') {
          setGeoJsonInteractivity(geoJsonLayer, false);
        }
      } catch (err) {
        console.error(`Feil ved parsing av AIP-sone ${zone.zone_id}:`, err);
      }
    }
  } catch (err) {
    console.error('Kunne ikke hente AIP-soner:', err);
  }
}

export async function fetchObstacles(params: FetchParams) {
  const { layer, mode } = params;
  try {
    const { data, error } = await supabase
      .from('openaip_obstacles')
      .select('openaip_id, name, type, geometry, elevation, height_agl, properties');

    if (error || !data) {
      console.error('Feil ved henting av hindringer:', error);
      return;
    }

    layer.clearLayers();

    for (const obstacle of data) {
      if (!obstacle.geometry) continue;

      try {
        const geom = obstacle.geometry as any;
        let lat: number, lng: number;
        
        if (geom.coordinates) {
          [lng, lat] = geom.coordinates;
        } else {
          continue;
        }

        const obstacleIcon = L.divIcon({
          className: '',
          html: `<div style="
            width: 20px;
            height: 20px;
            display: flex;
            align-items: center;
            justify-content: center;
          ">
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="#ef4444" stroke="#991b1b" stroke-width="1.5">
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
              <line x1="12" y1="9" x2="12" y2="13" stroke="white" stroke-width="2"/>
              <line x1="12" y1="17" x2="12.01" y2="17" stroke="white" stroke-width="2"/>
            </svg>
          </div>`,
          iconSize: [20, 20],
          iconAnchor: [10, 10],
          popupAnchor: [0, -10],
        });

        const marker = L.marker([lat, lng], { icon: obstacleIcon, interactive: mode !== 'routePlanning', pane: 'obstaclePane' });
        
        const typeName = obstacle.type || 'Ukjent';
        const displayName = obstacle.name || typeName;
        let popup = `<strong>⚠️ Hindring</strong><br/>`;
        popup += `<strong>${displayName}</strong><br/>`;
        popup += `Type: ${typeName}<br/>`;
        if (obstacle.elevation) popup += `Høyde (MSL): ${obstacle.elevation} m<br/>`;
        if (obstacle.height_agl) popup += `Høyde (AGL): ${obstacle.height_agl} m<br/>`;
        marker.bindPopup(popup);
        
        marker.addTo(layer);
      } catch (err) {
        // Skip individual obstacles that fail
      }
    }
  } catch (err) {
    console.error('Kunne ikke hente hindringer:', err);
  }
}

export async function fetchAirportsData(params: FetchParams) {
  const { layer, mode } = params;
  try {
    const url = "https://services.arcgis.com/a8CwScMFSS2ljjgn/ArcGIS/rest/services/FlyplassInfo_PROD/FeatureServer/0/query?where=1%3D1&outFields=*&outSR=4326&f=geojson";
    const response = await fetch(url);
    if (!response.ok) return;
    
    const geojson = await response.json();
   
    const coordinateFixes: Record<string, [number, number]> = {
      'ENKJ': [11.0364, 59.9753],
    };
   
    if (geojson.features) {
      geojson.features = geojson.features.map((feature: any) => {
        const icao = feature.properties?.ICAO || feature.properties?.icao;
        if (icao && coordinateFixes[icao] && feature.geometry?.coordinates) {
          feature.geometry.coordinates = coordinateFixes[icao];
        }
        return feature;
      });
    }
   
    const geoJsonLayer = L.geoJSON(geojson, {
      pointToLayer: (feature, latlng) => {
        const icon = L.icon({
          iconUrl: airportIcon,
          iconSize: [32, 40],
          iconAnchor: [16, 40],
          popupAnchor: [0, -40]
        });
        return L.marker(latlng, { icon, interactive: mode !== 'routePlanning', pane: 'airportPane' });
      },
      onEachFeature: mode !== 'routePlanning' ? (feature, layer) => {
        if (feature.properties) {
          const props = feature.properties;
          const icao = props.ICAO || props.icao || '';
          const iata = props.IATA || props.iata || '';
          const name = props.NAVN || props.navn || props.name || props.Name || icao || 'Flyplass';
          
          let popupContent = `<strong>${name}</strong>`;
          if (icao) popupContent += `<br/>ICAO: ${icao}`;
          if (iata) popupContent += `<br/>IATA: ${iata}`;
          
          layer.bindPopup(popupContent);
        }
      } : undefined
    });
    
    layer.clearLayers();
    layer.addLayer(geoJsonLayer);
  } catch (err) {
    console.error("Kunne ikke hente flyplasser:", err);
  }
}

export async function fetchAndDisplayMissions(params: {
  missionsLayer: L.LayerGroup;
  completedMissionsLayer?: L.LayerGroup;
  modeRef: React.MutableRefObject<string>;
  onMissionClickRef: React.MutableRefObject<((mission: any) => void) | undefined>;
}) {
  const { missionsLayer, completedMissionsLayer, modeRef, onMissionClickRef } = params;
  if (modeRef.current !== "view") return;
  
  try {
    const { data: missions, error } = await supabase
      .from("missions")
      .select("*")
      .not("latitude", "is", null)
      .not("longitude", "is", null);

    if (error) return;
    
    missionsLayer.clearLayers();
    completedMissionsLayer?.clearLayers();

    missions?.forEach((mission) => {
      if (!mission.latitude || !mission.longitude) return;

      const isCompleted = mission.status === 'Fullført';

      let markerColor = '#3b82f6';
      if (mission.status === 'Pågående') markerColor = '#eab308';
      else if (isCompleted) markerColor = '#6b7280';
      
      const icon = L.divIcon({
        className: '',
        html: `<div style="
          width: 32px;
          height: 32px;
          display: flex;
          align-items: center;
          justify-content: center;
          filter: drop-shadow(0 2px 4px rgba(0,0,0,0.3));
        ">
          <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="${markerColor}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/>
            <circle cx="12" cy="10" r="3" fill="${markerColor}"/>
          </svg>
        </div>`,
        iconSize: [32, 32],
        iconAnchor: [16, 32],
      });

      const marker = L.marker([mission.latitude, mission.longitude], { icon, pane: 'missionPane' });
      marker.on('click', () => {
        onMissionClickRef.current?.(mission);
      });

      // Add completed missions to separate layer if available, otherwise to main layer
      if (isCompleted && completedMissionsLayer) {
        marker.addTo(completedMissionsLayer);
      } else {
        marker.addTo(missionsLayer);
      }
    });
  } catch (err) {
    console.error("Feil ved henting av oppdrag:", err);
  }
}

export async function fetchDroneTelemetry(params: {
  droneLayer: L.LayerGroup;
  modeRef: React.MutableRefObject<string>;
}) {
  const { droneLayer, modeRef } = params;
  try {
    const { data: telemetry, error } = await supabase
      .from('drone_telemetry')
      .select('*')
      .order('created_at', { ascending: false });
    
    if (error || !telemetry) return;
    
    droneLayer.clearLayers();
    
    const latestByDrone = new Map<string, typeof telemetry[0]>();
    telemetry.forEach(t => {
      const droneId = t.drone_id || 'unknown';
      if (!latestByDrone.has(droneId)) {
        latestByDrone.set(droneId, t);
      }
    });
    
    latestByDrone.forEach((t, droneId) => {
      if (!t.lat || !t.lon) return;
      
      const icon = L.divIcon({
        className: '',
        html: `<img src="${droneAnimatedIcon}" style="width:70px;height:70px;" />`,
        iconSize: [70, 70],
        iconAnchor: [35, 35],
        popupAnchor: [0, -35],
      });
      
      const marker = L.marker([t.lat, t.lon], {
        icon,
        interactive: modeRef.current !== 'routePlanning',
        pane: 'liveFlightPane'
      });
      const updatedTime = t.created_at ? new Date(t.created_at).toLocaleTimeString('no-NO') : 'Ukjent';
      marker.bindPopup(
        `<div>
          <strong>🛸 ${droneId}</strong><br/>
          Høyde: ${t.alt ?? '?'} m<br/>
          Oppdatert: ${updatedTime}
        </div>`,
        { autoPan: false, keepInView: false }
      );
      marker.addTo(droneLayer);
    });
  } catch (err) {
    console.error('Feil ved henting av dronetelemetri:', err);
  }
}

export async function fetchActiveAdvisories(params: {
  activeAdvisoryLayer: L.LayerGroup;
  flightMarkersRef: React.MutableRefObject<Map<string, L.Marker>>;
}) {
  const { activeAdvisoryLayer, flightMarkersRef } = params;
  try {
    const { data: activeFlights, error } = await supabase
      .from('active_flights')
      .select('id, mission_id, publish_mode, route_data')
      .eq('publish_mode', 'advisory');
    
    if (error) {
      console.error('Error fetching active advisories:', error);
      return;
    }
    
    activeAdvisoryLayer.clearLayers();
    for (const [key] of flightMarkersRef.current) {
      if (key.startsWith('advisory_')) flightMarkersRef.current.delete(key);
    }
    
    for (const flight of activeFlights || []) {
      const route = flight.route_data as any;
      if (!route?.coordinates || route.coordinates.length < 3) continue;
      
      const polygonCoords = route.coordinates.map((p: any) => [p.lat, p.lng] as [number, number]);
      
      const polygon = L.polygon(polygonCoords, {
        color: '#10b981',
        weight: 2,
        fillColor: '#10b981',
        fillOpacity: 0.25,
        interactive: true,
      });
      
      polygon.bindPopup(`
        <div>
          <strong>🛸 Aktiv flytur</strong><br/>
          <span style="color: #10b981; font-size: 11px;">Advisory publisert til SafeSky</span>
        </div>
      `);
      
      polygon.addTo(activeAdvisoryLayer);

      const centLat = polygonCoords.reduce((s: number, c: [number, number]) => s + c[0], 0) / polygonCoords.length;
      const centLng = polygonCoords.reduce((s: number, c: [number, number]) => s + c[1], 0) / polygonCoords.length;
      const droneIcon = L.divIcon({
        className: '',
        html: `<img src="${droneAnimatedIcon}" style="width:70px;height:70px;" />`,
        iconSize: [70, 70],
        iconAnchor: [35, 35],
        popupAnchor: [0, -35],
      });
      const centroidMarker = L.marker([centLat, centLng], {
        icon: droneIcon,
        interactive: true,
        pane: 'liveFlightPane'
      });
      centroidMarker.bindPopup(`
        <div>
          <strong>🛸 Aktiv flytur</strong><br/>
          <span style="color: #10b981; font-size: 11px;">Advisory publisert til SafeSky</span>
        </div>
      `);
      centroidMarker.addTo(activeAdvisoryLayer);
      flightMarkersRef.current.set(flight.id, centroidMarker as any);
    }
  } catch (err) {
    console.error('Error fetching active advisories:', err);
  }
}

export interface BoundsFetchParams extends FetchParams {
  bounds: { minLat: number; minLng: number; maxLat: number; maxLng: number };
}

export async function fetchNaturvernZones(params: BoundsFetchParams) {
  const { layer, mode, bounds } = params;
  try {
    const { data, error } = await supabase.rpc('get_naturvern_in_bounds', {
      min_lat: bounds.minLat,
      min_lng: bounds.minLng,
      max_lat: bounds.maxLat,
      max_lng: bounds.maxLng,
    });

    if (error || !data) {
      console.error('Feil ved henting av naturvernområder:', error);
      return;
    }

    const verneformColors: Record<string, string> = {
      'Nasjonalpark': '#15803d',
      'Naturreservat': '#166534',
      'Landskapsvernområde': '#4ade80',
      'Biotopvernområde': '#22c55e',
      'Marint verneområde': '#0ea5e9',
      'Dyrefredningsområde': '#a3e635',
      'Plantefredningsområde': '#84cc16',
    };

    for (const zone of data) {
      if (!zone.geometry) continue;
      try {
        const geojsonFeature = {
          type: 'Feature' as const,
          geometry: zone.geometry,
          properties: { name: zone.name, verneform: zone.verneform },
        };

        const color = verneformColors[zone.verneform || ''] || '#16a34a';

        const geoJsonLayer = L.geoJSON(geojsonFeature as any, {
          interactive: mode !== 'routePlanning',
          pane: 'overlayPane',
          style: {
            color,
            weight: 1.5,
            fillColor: color,
            fillOpacity: 0.15,
          },
          onEachFeature: mode !== 'routePlanning' ? (feature, layer) => {
            const p = feature.properties || {};
            let popup = `<strong>🌿 Naturvernområde</strong><br/>`;
            popup += `<strong>${p.name || 'Ukjent'}</strong><br/>`;
            if (p.verneform) popup += `Verneform: ${p.verneform}<br/>`;
            layer.bindPopup(popup);
          } : undefined,
        });
        geoJsonLayer.addTo(layer);
      } catch (err) {
        // Skip individual zones that fail
      }
    }
    console.log(`Rendered ${data.length} naturvernområder (viewport)`);
  } catch (err) {
    console.error('Kunne ikke hente naturvernområder:', err);
  }
}

export async function fetchVernRestrictionZones(params: BoundsFetchParams) {
  const { layer, mode, bounds } = params;
  try {
    const { data, error } = await supabase.rpc('get_vern_restrictions_in_bounds', {
      min_lat: bounds.minLat,
      min_lng: bounds.minLng,
      max_lat: bounds.maxLat,
      max_lng: bounds.maxLng,
    });

    if (error || !data) {
      console.error('Feil ved henting av vern-restriksjoner:', error);
      return;
    }

    const restrictionColors: Record<string, string> = {
      'FERDSELSFORBUD': '#dc2626',
      'LANDINGSFORBUD': '#f97316',
      'LAVFLYVING': '#eab308',
    };

    const restrictionLabels: Record<string, string> = {
      'FERDSELSFORBUD': 'Ferdselsforbud',
      'LANDINGSFORBUD': 'Landingsforbud',
      'LAVFLYVING': 'Lavflyvingsforbud under 300m',
    };

    for (const zone of data) {
      if (!zone.geometry) continue;
      try {
        const geojsonFeature = {
          type: 'Feature' as const,
          geometry: zone.geometry,
          properties: { name: zone.name, restriction_type: zone.restriction_type },
        };

        const color = restrictionColors[zone.restriction_type || ''] || '#ef4444';
        const label = restrictionLabels[zone.restriction_type || ''] || zone.restriction_type || 'Restriksjon';

        const geoJsonLayer = L.geoJSON(geojsonFeature as any, {
          interactive: mode !== 'routePlanning',
          pane: 'overlayPane',
          style: {
            color,
            weight: 2,
            fillColor: color,
            fillOpacity: 0.2,
            dashArray: '5, 5',
          },
          onEachFeature: mode !== 'routePlanning' ? (feature, layer) => {
            const p = feature.properties || {};
            let popup = `<strong>⛔ ${label}</strong><br/>`;
            popup += `<strong>${p.name || 'Ukjent'}</strong>`;
            layer.bindPopup(popup);
          } : undefined,
        });
        geoJsonLayer.addTo(layer);
      } catch (err) {
        // Skip individual zones that fail
      }
    }
    console.log(`Rendered ${data.length} vern-restriksjoner (viewport)`);
  } catch (err) {
    console.error('Kunne ikke hente vern-restriksjoner:', err);
  }
}

export async function fetchPilotPositions(params: {
  pilotPositionsLayer: L.LayerGroup;
  flightMarkersRef: React.MutableRefObject<Map<string, L.Marker>>;
  mode: string;
}) {
  const { pilotPositionsLayer, flightMarkersRef, mode } = params;
  try {
    const { data: liveFlights, error } = await supabase
      .from('active_flights')
      .select('id, start_lat, start_lng, pilot_name, start_time, publish_mode')
      .in('publish_mode', ['live_uav', 'none'])
      .not('start_lat', 'is', null)
      .not('start_lng', 'is', null);
    
    if (error) {
      console.error('Error fetching pilot positions:', error);
      return;
    }
    
    pilotPositionsLayer.clearLayers();
    for (const [key] of flightMarkersRef.current) {
      if (key.startsWith('live_')) flightMarkersRef.current.delete(key);
    }
    
    for (const flight of liveFlights || []) {
      if (!flight.start_lat || !flight.start_lng) continue;
      
      const isInternal = flight.publish_mode === 'none';
      const bgColor = isInternal ? '#6b7280' : '#0ea5e9';
      
      const pilotIcon = L.divIcon({
        className: '',
        html: `<div style="
          width: 32px;
          height: 32px;
          background: ${bgColor};
          border: 3px solid white;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          box-shadow: 0 2px 8px rgba(0,0,0,0.4);
        ">
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="white" stroke="white" stroke-width="1">
            <circle cx="12" cy="7" r="4"/>
            <path d="M5.5 21a9.5 9.5 0 0 1 13 0"/>
          </svg>
        </div>`,
        iconSize: [32, 32],
        iconAnchor: [16, 16],
        popupAnchor: [0, -16],
      });
      
      const marker = L.marker([flight.start_lat, flight.start_lng], { 
        icon: pilotIcon, 
        interactive: mode !== 'routePlanning',
        pane: 'liveFlightPane'
      });
      
      const startTime = flight.start_time ? new Date(flight.start_time).toLocaleTimeString('no-NO', { hour: '2-digit', minute: '2-digit' }) : 'Ukjent';
      const pilotName = flight.pilot_name || 'Ukjent pilot';
      const label = isInternal ? 'Intern flytur' : 'Pilot (live posisjon)';
      
      marker.bindPopup(`
        <div>
          <strong>👤 ${pilotName}</strong><br/>
          <span style="font-size: 11px; color: #666;">${label}</span><br/>
          <span style="font-size: 11px;">Startet: ${startTime}</span>
        </div>
      `);
      
      marker.addTo(pilotPositionsLayer);
      flightMarkersRef.current.set(flight.id, marker);
    }
    
    console.log(`Rendered ${liveFlights?.length || 0} pilot positions`);
  } catch (err) {
    console.error('Error fetching pilot positions:', err);
  }
}

// --- Kraftledninger (NVE) via ArcGIS REST ---

const NVE_BASE = "https://kart.nve.no/enterprise/rest/services/Nettanlegg4/MapServer";



interface KraftLayerDef {
  layerId: number;
  label: string;
  color: string;
  weight: number;
  dashArray?: string;
  minZoom: number;
  maxZoom?: number;
  isPoint?: boolean;
  isPolygon?: boolean;
  fillOpacity?: number;
}

const KRAFT_LAYERS: KraftLayerDef[] = [
  // Polygoner først (rendres under alt annet)
  
  // Linjer
  { layerId: 0, label: "Transmisjonsnett", color: "#2563eb", weight: 3, minZoom: 8 },
  { layerId: 1, label: "Regionalnett", color: "#f97316", weight: 2, minZoom: 8 },
  { layerId: 3, label: "Sjøkabel", color: "#06b6d4", weight: 2, dashArray: "6, 4", minZoom: 11 },
  { layerId: 2, label: "Distribusjonsnett", color: "#eab308", weight: 1.5, minZoom: 13 },
  // Punkter
  { layerId: 5, label: "Transformatorstasjon", color: "#a855f7", weight: 0, minZoom: 11, isPoint: true },
  { layerId: 4, label: "Mast/stolpe", color: "#64748b", weight: 0, minZoom: 16, isPoint: true },
];

const escapePopupHtml = (value: unknown) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const getFirstProperty = (props: Record<string, unknown>, keys: string[]) => {
  const match = keys.find((key) => props[key] !== null && props[key] !== undefined && String(props[key]).trim() !== "");
  return match ? props[match] : "";
};

export async function fetchKraftledningerInBounds(params: {
  layer: L.LayerGroup;
  bounds: L.LatLngBounds;
  zoom: number;
  pane: string;
  mode: string;
}) {
  const { layer, bounds, zoom, pane, mode } = params;
  layer.clearLayers();

  const sw = bounds.getSouthWest();
  const ne = bounds.getNorthEast();
  const envelope = `${sw.lng},${sw.lat},${ne.lng},${ne.lat}`;

  const fetches = KRAFT_LAYERS
    .filter(def => zoom >= def.minZoom && (!def.maxZoom || zoom <= def.maxZoom))
    .map(async (def) => {
      try {
        const url = `${NVE_BASE}/${def.layerId}/query?where=1%3D1&geometry=${encodeURIComponent(envelope)}&geometryType=esriGeometryEnvelope&inSR=4326&spatialRel=esriSpatialRelIntersects&outFields=*&outSR=4326&f=geojson&resultRecordCount=2000`;
        const res = await fetch(url);
        if (!res.ok) {
          console.warn(`[NVE] Layer ${def.layerId} returned HTTP ${res.status} from ${NVE_BASE}`);
          return;
        }
        const geojson = await res.json();
        if (!geojson.features?.length) return;

        const geoLayer = L.geoJSON(geojson, {
          pane,
          interactive: mode !== "routePlanning",
          style: def.isPoint ? undefined : {
            color: def.color,
            weight: def.weight,
            opacity: def.isPolygon ? 0.5 : 0.85,
            fillColor: def.isPolygon ? def.color : undefined,
            fillOpacity: def.fillOpacity ?? (def.isPolygon ? 0.08 : 0),
            dashArray: def.dashArray,
          },
          pointToLayer: def.isPoint ? (_f, latlng) => {
            return L.circleMarker(latlng, {
              pane,
              radius: def.layerId === 4 ? 3 : 5,
              fillColor: def.color,
              color: "#fff",
              weight: 1,
              fillOpacity: 0.8,
            });
          } : undefined,
          onEachFeature: mode !== "routePlanning" ? (feature, l) => {
            const p = feature.properties || {};
            const details = [
              ["Navn", getFirstProperty(p, ["NAVN", "navn", "Navn", "name", "Name"])],
              ["Eier", getFirstProperty(p, ["EIER", "eier", "Eier", "NETTSELSKAP", "nettselskap"])],
              ["Spenning", getFirstProperty(p, ["SPENNING", "spenning", "Spenning", "SPENNING_KV", "spenning_kv"])],
              ["Type", getFirstProperty(p, ["TYPE", "type", "Type", "NETTNIVA", "NETTNIVÅ", "nettniva", "nettnivå"])],
              ["Status", getFirstProperty(p, ["STATUS", "status", "Status"])],
            ].filter(([, value]) => value !== "");
            const rows = details.map(([label, value]) => {
              const suffix = label === "Spenning" && !String(value).toLowerCase().includes("kv") ? " kV" : "";
              return `<div style="display:grid;grid-template-columns:72px 1fr;gap:8px;font-size:12px;line-height:1.35;padding:2px 0;"><span style="color:#64748b;">${escapePopupHtml(label)}</span><strong style="font-weight:600;overflow-wrap:anywhere;">${escapePopupHtml(value)}${suffix}</strong></div>`;
            }).join("");
            const popup = `<div style="min-width:180px;max-width:280px;"><strong>${escapePopupHtml(def.label)}</strong>${rows ? `<div style="margin-top:6px;">${rows}</div>` : "<br/>Ingen detaljer tilgjengelig"}</div>`;
            l.bindPopup(popup);
          } : undefined,
        });
        geoLayer.addTo(layer);
      } catch (err) {
        console.error(`Feil ved henting av NVE lag ${def.layerId}:`, err);
      }
    });

  await Promise.all(fetches);
}

// --- Live NOTAM ---

export async function fetchNotams(params: {
  layer: L.LayerGroup;
  pane: string;
  pinPane: string;
  mode: string;
}) {
  const { layer, pane, pinPane, mode } = params;

  layer.clearLayers();

  // Dedicated SVG renderer bound to notamPane so vectors live in their own SVG container
  const map = (layer as any)._map as L.Map | null;
  if (!map) return;
  if (!map.getPane(pane)) map.createPane(pane);
  if (!map.getPane(pinPane)) map.createPane(pinPane);

  // Reuse existing renderer if available to avoid orphaned SVG containers
  let notamRenderer: L.SVG;
  if ((layer as any)._notamRenderer && (layer as any)._notamRenderer._map === map) {
    notamRenderer = (layer as any)._notamRenderer;
  } else {
    notamRenderer = L.svg({ pane });
    notamRenderer.addTo(map);
    (layer as any)._notamRenderer = notamRenderer;
  }

  try {
    const { data, error } = await supabase
      .from("notams")
      .select("*")
      .or(`effective_end.gt.${new Date().toISOString()},effective_end_interpretation.in.(PERM,EST),effective_end.is.null`)
      .limit(1000);

    if (error) {
      console.error("[NOTAM] Query error:", error);
      return;
    }

    if (!data || data.length === 0) return;

    for (const notam of data) {
      // Try to render geometry
      if (notam.geometry_geojson) {
        try {
          const geoLayer = L.geoJSON(notam.geometry_geojson as any, {
            pane,
            renderer: notamRenderer,
            interactive: mode !== "routePlanning",
            bubblingMouseEvents: false,
            pointToLayer: (_feature: any, latlng: L.LatLng) => {
              return L.marker(latlng, {
                pane: pinPane,
                interactive: mode !== "routePlanning",
                bubblingMouseEvents: false,
                icon: L.divIcon({
                  className: 'notam-pin-icon',
                  html: `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="36" viewBox="0 0 28 36">
                    <path d="M14 0C6.27 0 0 6.27 0 14c0 10.5 14 22 14 22s14-11.5 14-22C28 6.27 21.73 0 14 0z" fill="#e67e22" stroke="#c0392b" stroke-width="1.5"/>
                    <circle cx="14" cy="13" r="6" fill="white" opacity="0.9"/>
                    <text x="14" y="17" text-anchor="middle" font-size="11" font-weight="bold" fill="#e67e22" font-family="Arial,sans-serif">!</text>
                  </svg>`,
                  iconSize: [28, 36] as any,
                  iconAnchor: [14, 36] as any,
                  popupAnchor: [0, -36] as any,
                }),
              });
            },
            style: {
              color: "#e67e22",
              weight: 2,
              fillColor: "#f39c12",
              fillOpacity: 0.15,
              dashArray: "5, 5",
            },
          } as any);

          if (mode !== "routePlanning") {
            geoLayer.bindPopup(buildNotamPopup(notam));
          }

          geoLayer.addTo(layer);
          geoLayer.bringToFront();
        } catch {
          // Fallback to center marker
          addNotamCenterMarker(notam, layer, pane, pinPane, mode, notamRenderer);
        }
      } else if (notam.center_lat != null && notam.center_lng != null) {
        addNotamCenterMarker(notam, layer, pane, pinPane, mode, notamRenderer);
      }
    }

    console.log(`[NOTAM] Rendered ${data.length} NOTAMs`);
  } catch (err) {
    console.error("[NOTAM] Error:", err);
  }
}

function addNotamCenterMarker(notam: any, layer: L.LayerGroup, pane: string, pinPane: string, mode: string, renderer?: L.Renderer) {
  if (notam.center_lat == null || notam.center_lng == null) return;

  const isAerodrome = notam.scope === "A";

  let marker: L.Layer;
  if (isAerodrome) {
    // Use a pin icon for aerodrome NOTAMs — pin pane (above airspace areas)
    marker = L.marker([notam.center_lat, notam.center_lng], {
      pane: pinPane,
      interactive: mode !== "routePlanning",
      bubblingMouseEvents: false,
      icon: L.divIcon({
        className: 'notam-pin-icon',
        html: `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="36" viewBox="0 0 28 36">
          <path d="M14 0C6.27 0 0 6.27 0 14c0 10.5 14 22 14 22s14-11.5 14-22C28 6.27 21.73 0 14 0z" fill="#e67e22" stroke="#c0392b" stroke-width="1.5"/>
          <circle cx="14" cy="13" r="6" fill="white" opacity="0.9"/>
          <text x="14" y="17" text-anchor="middle" font-size="11" font-weight="bold" fill="#e67e22" font-family="Arial,sans-serif">!</text>
        </svg>`,
        iconSize: [28, 36] as any,
        iconAnchor: [14, 36] as any,
        popupAnchor: [0, -36] as any,
      }),
    });
  } else {
    // Use circle marker for other NOTAMs without geometry — treat as area, stays on notamPane
    marker = L.circleMarker([notam.center_lat, notam.center_lng], {
      pane,
      renderer,
      radius: 8,
      fillColor: "#f39c12",
      color: "#e67e22",
      weight: 2,
      fillOpacity: 0.6,
      interactive: mode !== "routePlanning",
      bubblingMouseEvents: false,
    });
  }

  if (mode !== "routePlanning") {
    (marker as any).bindPopup(buildNotamPopup(notam));
  }

  (marker as any).addTo(layer);
  if (typeof (marker as any).bringToFront === 'function') {
    (marker as any).bringToFront();
  }
}

function buildNotamPopup(notam: any): string {
  const start = notam.effective_start
    ? new Date(notam.effective_start).toLocaleDateString("no-NO", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })
    : "–";
  const end = notam.effective_end
    ? new Date(notam.effective_end).toLocaleDateString("no-NO", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })
    : notam.effective_end_interpretation === "PERM" ? "PERMANENT" : "Ukjent";

  const qcode = notam.qcode ? `<br/><span style="font-size:10px;color:#888;">Q: ${notam.qcode}</span>` : "";
  const location = notam.location ? `<br/><span style="font-size:11px;">📍 ${notam.location}</span>` : "";
  const flLimits = (notam.minimum_fl != null || notam.maximum_fl != null)
    ? `<br/><span style="font-size:11px;">FL${notam.minimum_fl ?? 0}–FL${notam.maximum_fl ?? "∞"}</span>`
    : "";

  const text = notam.notam_text
    ? `<div style="max-height:150px;overflow-y:auto;font-size:11px;margin-top:4px;white-space:pre-wrap;">${notam.notam_text}</div>`
    : "";

  return `<div style="max-width:320px;">
    <strong>⚠️ NOTAM ${notam.series || ""}${notam.number}/${notam.year}</strong>
    ${location}${qcode}${flLimits}
    <br/><span style="font-size:11px;">🕐 ${start} → ${end}</span>
    ${text}
  </div>`;
}

// --- NAIS / AIS skipstrafikk (BarentsWatch) ---

const SHIP_TYPE_NAMES: Record<number, string> = {
  30: "Fiskefartøy",
  31: "Sleping",
  32: "Sleping",
  33: "Mudring",
  34: "Dykking",
  35: "Militær",
  36: "Seilbåt",
  37: "Fritidsfartøy",
  40: "Hurtiggående fartøy",
  50: "Losfartøy",
  51: "SAR",
  52: "Taubåt",
  53: "Havneassistanse",
  55: "Politi",
  58: "Medisinsk",
  60: "Passasjerskip",
  70: "Lasteskip",
  80: "Tankskip",
};

function getShipTypeName(type: number | null): string {
  if (type == null) return "Ukjent";
  // Types are grouped by tens (60-69 = passenger, 70-79 = cargo, etc.)
  const base = Math.floor(type / 10) * 10;
  return SHIP_TYPE_NAMES[type] || SHIP_TYPE_NAMES[base] || `Type ${type}`;
}

function createVesselIcon(cog: number | null, shipType: number | null): L.DivIcon {
  const rotation = cog != null ? cog : 0;
  // Color based on type
  let color = "#2563eb"; // default blue
  const base = shipType != null ? Math.floor(shipType / 10) * 10 : 0;
  if (base === 30) color = "#059669"; // fishing = green
  else if (base === 60) color = "#7c3aed"; // passenger = purple
  else if (base === 70) color = "#d97706"; // cargo = amber
  else if (base === 80) color = "#dc2626"; // tanker = red
  else if (shipType === 35) color = "#475569"; // military = slate
  else if (shipType === 51 || shipType === 52) color = "#ea580c"; // SAR/tug = orange

  return L.divIcon({
    className: "",
    html: `<div style="
      width: 20px; height: 20px;
      display: flex; align-items: center; justify-content: center;
      transform: rotate(${rotation}deg);
    ">
      <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="${color}" stroke="#fff" stroke-width="1">
        <path d="M12 2 L6 20 L12 16 L18 20 Z"/>
      </svg>
    </div>`,
    iconSize: [20, 20],
    iconAnchor: [10, 10],
    popupAnchor: [0, -10],
  });
}

export async function fetchAisVesselsInBounds(params: {
  layer: L.LayerGroup;
  bounds: L.LatLngBounds;
  zoom: number;
  pane: string;
  mode: string;
}) {
  const { layer, bounds, zoom, pane, mode } = params;
  layer.clearLayers();

  if (zoom < 8) return;

  const sw = bounds.getSouthWest();
  const ne = bounds.getNorthEast();

  try {
    const { data, error } = await supabase.functions.invoke("barentswatch-ais", {
      body: {
        bounds: {
          minLat: sw.lat,
          minLng: sw.lng,
          maxLat: ne.lat,
          maxLng: ne.lng,
        },
      },
    });

    if (error) {
      console.error("[NAIS] Edge function error:", error);
      return;
    }

    const vessels = data?.vessels;
    if (!Array.isArray(vessels)) {
      console.warn("[NAIS] Unexpected response:", data);
      return;
    }

    for (const v of vessels) {
      if (v.lat == null || v.lon == null) continue;

      const icon = createVesselIcon(v.cog, v.shipType);
      const marker = L.marker([v.lat, v.lon], {
        icon,
        interactive: mode !== "routePlanning",
        pane,
      });

      const typeName = getShipTypeName(v.shipType);
      const sogKnots = v.sog != null ? `${v.sog.toFixed(1)} kn` : "–";
      const cogDeg = v.cog != null ? `${Math.round(v.cog)}°` : "–";
      const name = v.name || "Ukjent";

      let popup = `<strong>🚢 ${name}</strong><br/>`;
      popup += `MMSI: ${v.mmsi || "–"}<br/>`;
      popup += `Type: ${typeName}<br/>`;
      popup += `Fart: ${sogKnots}<br/>`;
      popup += `Kurs: ${cogDeg}<br/>`;
      if (v.destination) popup += `Dest: ${v.destination}<br/>`;

      marker.bindPopup(popup);
      marker.addTo(layer);
    }

    console.log(`[NAIS] Rendered ${vessels.length} vessels`);
  } catch (err) {
    console.error("[NAIS] Error:", err);
  }
}
