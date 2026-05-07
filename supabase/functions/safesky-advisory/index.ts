import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { generateAuthHeaders } from "../_shared/safesky-hmac.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SAFESKY_UAV_URL = 'https://sandbox-public-api.safesky.app/v1/uav';
const SAFESKY_ADVISORY_URL = 'https://uav-api.safesky.app/v1/advisory';

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

interface MissionRoute {
  coordinates: RoutePoint[];
  totalDistance?: number;
  soraSettings?: SoraSettings;
}

interface GeoJSONPolygonFeature {
  type: "Feature";
  properties: {
    id: string;
    call_sign: string;
    last_update: number;
    max_altitude: number;
    remarks: string;
  };
  geometry: {
    type: "Polygon";
    coordinates: number[][][];
  };
}

interface GeoJSONPointFeature {
  type: "Feature";
  properties: {
    id: string;
    call_sign: string;
    last_update: number;
    max_altitude: number;
    max_distance: number;
    remarks: string;
  };
  geometry: {
    type: "Point";
    coordinates: [number, number];
  };
}

interface GeoJSONFeatureCollection {
  type: "FeatureCollection";
  features: (GeoJSONPolygonFeature | GeoJSONPointFeature)[];
}

// Default SORA fallback values
const DEFAULT_FLIGHT_ALTITUDE = 120; // meters AGL
const DEFAULT_CONTINGENCY_HEIGHT = 30; // meters

// Advisory size limits
const MAX_ADVISORY_AREA_KM2 = 150;
const LARGE_ADVISORY_THRESHOLD_KM2 = 50;

// --- Terrain elevation helpers ---

async function fetchMaxTerrainElevation(coords: RoutePoint[]): Promise<number> {
  if (coords.length === 0) return 0;

  try {
    // Batch in groups of 100 (Open-Meteo limit)
    const batchSize = 100;
    let maxElevation = 0;

    for (let i = 0; i < coords.length; i += batchSize) {
      const batch = coords.slice(i, i + batchSize);
      const lats = batch.map(c => c.lat.toFixed(4)).join(',');
      const lngs = batch.map(c => c.lng.toFixed(4)).join(',');

      const url = `https://api.open-meteo.com/v1/elevation?latitude=${lats}&longitude=${lngs}`;
      const response = await fetch(url);

      if (!response.ok) {
        console.warn(`Open-Meteo elevation API error: ${response.status}`);
        continue;
      }

      const data = await response.json();
      const elevations: number[] = data.elevation;

      if (elevations && elevations.length > 0) {
        const batchMax = Math.max(...elevations);
        if (batchMax > maxElevation) {
          maxElevation = batchMax;
        }
      }
    }

    console.log(`Terrain elevation: max=${maxElevation}m from ${coords.length} points`);
    return maxElevation;
  } catch (error) {
    console.error('Terrain elevation lookup failed, using 0:', error);
    return 0;
  }
}

// --- Geometry helpers ---

function cross(O: number[], A: number[], B: number[]): number {
  return (A[0] - O[0]) * (B[1] - O[1]) - (A[1] - O[1]) * (B[0] - O[0]);
}

function calculatePolygonAreaKm2(coordinates: number[][]): number {
  if (coordinates.length < 3) return 0;

  let centroidLat = 0, centroidLng = 0;
  const n = coordinates.length - 1;
  for (let i = 0; i < n; i++) {
    centroidLng += coordinates[i][0];
    centroidLat += coordinates[i][1];
  }
  centroidLat /= n;
  centroidLng /= n;

  const cosLat = Math.cos(centroidLat * Math.PI / 180);
  const points: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    const lng = coordinates[i][0];
    const lat = coordinates[i][1];
    const x = (lng - centroidLng) * 111.32 * cosLat;
    const y = (lat - centroidLat) * 111.32;
    points.push([x, y]);
  }

  let area = 0;
  for (let i = 0; i < points.length; i++) {
    const j = (i + 1) % points.length;
    area += points[i][0] * points[j][1];
    area -= points[j][0] * points[i][1];
  }
  return Math.abs(area) / 2;
}

function computeConvexHull(points: number[][]): number[][] {
  if (points.length < 3) {
    const result = [...points];
    if (result.length > 0) result.push([...result[0]]);
    return result;
  }

  const sorted = [...points].sort((a, b) => a[0] === b[0] ? a[1] - b[1] : a[0] - b[0]);

  const lower: number[][] = [];
  for (const p of sorted) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
    lower.push(p);
  }

  const upper: number[][] = [];
  for (let i = sorted.length - 1; i >= 0; i--) {
    const p = sorted[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
    upper.push(p);
  }

  lower.pop();
  upper.pop();

  const hull = [...lower, ...upper];
  if (hull.length > 0) hull.push([...hull[0]]);
  return hull;
}

function routeToPolygon(route: MissionRoute): number[][] {
  const coordinates = route.coordinates.map(p => [p.lng, p.lat]);
  return computeConvexHull(coordinates);
}

// --- Main handler ---

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { action, missionId, lat, lon, lng, alt, speed, heading, altitudeDelta, verticalSpeed, pilotName } = body;
    
    console.log(`SafeSky: action=${action}, missionId=${missionId}, lat=${lat}, lng=${lng || lon}, pilotName=${pilotName}`);

    const SAFESKY_API_KEY = Deno.env.get('SAFESKY_API_KEY');
    const SAFESKY_PROD_API_KEY = Deno.env.get('SAFESKY_PROD_API_KEY');
    if (!SAFESKY_API_KEY) {
      console.error('SAFESKY_API_KEY not configured');
      return new Response(
        JSON.stringify({ error: 'SAFESKY_API_KEY not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    // Use production key for advisory, fall back to sandbox key
    const ADVISORY_API_KEY = SAFESKY_PROD_API_KEY || SAFESKY_API_KEY;
    console.log(`Using ${SAFESKY_PROD_API_KEY ? 'PRODUCTION' : 'SANDBOX'} key for advisory publishing`);

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // --- Point advisory (live_uav mode, 100m radius) ---
    if (action === 'publish_point_advisory' || action === 'refresh_point_advisory') {
      const latitude = lat;
      const longitude = lng || lon;
      
      if (latitude === undefined || longitude === undefined) {
        return new Response(
          JSON.stringify({ error: 'lat and lng are required for Point advisory' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Terrain lookup for single point → AMSL = terrain + default flight altitude
      const terrainElev = await fetchMaxTerrainElevation([{ lat: latitude, lng: longitude }]);
      const maxAltitudeAmsl = Math.round(terrainElev + DEFAULT_FLIGHT_ALTITUDE);
      console.log(`Point advisory AMSL: terrain=${terrainElev}m + flight=${DEFAULT_FLIGHT_ALTITUDE}m = ${maxAltitudeAmsl}m`);

      const callSign = 'Pilot posisjon';
      const advisoryId = `AVS_LIVE_${Date.now().toString(36)}`;

      const payload: GeoJSONFeatureCollection = {
        type: "FeatureCollection",
        features: [{
          type: "Feature",
          properties: {
            id: advisoryId,
            call_sign: callSign,
            last_update: Math.floor(Date.now() / 1000),
            max_altitude: maxAltitudeAmsl,
            max_distance: 100,
            remarks: "Live drone operation"
          },
          geometry: {
            type: "Point",
            coordinates: [longitude, latitude]
          }
        }]
      };

      console.log('Point Advisory payload:', JSON.stringify(payload, null, 2));

      const advisoryBody = JSON.stringify(payload);
      const pointAuthHeaders = await generateAuthHeaders(ADVISORY_API_KEY, 'POST', SAFESKY_ADVISORY_URL, advisoryBody);
      const response = await fetch(SAFESKY_ADVISORY_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...pointAuthHeaders },
        body: advisoryBody
      });

      const responseText = await response.text();
      console.log(`SafeSky Point Advisory response: ${response.status} - ${responseText}`);

      if (!response.ok) {
        return new Response(
          JSON.stringify({ error: 'SafeSky Point Advisory API error', status: response.status, details: responseText }),
          { status: response.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      return new Response(
        JSON.stringify({ 
          success: true, action, advisoryId, callSign,
          position: { lat: latitude, lng: longitude },
          maxAltitudeAmsl, terrainElevation: terrainElev,
          message: `Point advisory ${action === 'publish_point_advisory' ? 'published' : 'refreshed'} successfully (${maxAltitudeAmsl}m AMSL)`
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // --- Live UAV position (from GPS) ---
    if (action === 'publish_live_uav') {
      if (lat === undefined || lon === undefined) {
        return new Response(
          JSON.stringify({ error: 'lat and lon are required for live UAV publishing' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const groundSpeed = speed || 0;
      const status = "GROUNDED";
      
      console.log(`Flight status: ${status} (speed=${Math.round(groundSpeed)} m/s)`);

      const beaconId = `AVS_LIVE_${Date.now().toString(36)}`;
      const payload = [
        {
          id: beaconId,
          latitude: lat,
          longitude: lon,
          altitude: Math.round(alt || 50),
          status: status,
          last_update: Math.floor(Date.now() / 1000),
          ground_speed: Math.round(groundSpeed),
          course: Math.round(heading || 0),
        }
      ];

      console.log('Sending live UAV beacon:', JSON.stringify(payload));

      const liveBody = JSON.stringify(payload);
      const liveAuthHeaders = await generateAuthHeaders(SAFESKY_API_KEY, 'POST', SAFESKY_UAV_URL, liveBody);
      const response = await fetch(SAFESKY_UAV_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...liveAuthHeaders },
        body: liveBody
      });

      const responseText = await response.text();
      console.log(`SafeSky live UAV response: ${response.status} - ${responseText}`);

      if (!response.ok) {
        return new Response(
          JSON.stringify({ error: 'SafeSky API error', status: response.status, details: responseText }),
          { status: response.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      return new Response(
        JSON.stringify({ 
          success: true, action, beaconId, status,
          position: { lat, lon, alt: alt || 50 },
          dynamics: { speed: groundSpeed },
          message: `Live UAV position published as ${status}`
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // --- Advisory publishing (GeoJSON polygon for planned operations) ---
    if (action === 'publish_advisory' || action === 'refresh_advisory') {
      if (!missionId) {
        return new Response(
          JSON.stringify({ error: 'missionId is required for advisory' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const { data: mission, error: missionError } = await supabase
        .from('missions')
        .select('id, tittel, route, latitude, longitude, company_id')
        .eq('id', missionId)
        .single();

      if (missionError || !mission) {
        console.error('Mission fetch error:', missionError);
        return new Response(
          JSON.stringify({ error: 'Mission not found', details: missionError }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const route = mission.route as MissionRoute | null;
      
      if (!route || !route.coordinates || route.coordinates.length < 3) {
        return new Response(
          JSON.stringify({ error: 'Advisory requires a route with at least 3 points' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const advisoryId = `AVS_${missionId.substring(0, 8)}`;
      const polygonCoordinates = routeToPolygon(route);

      // Validate area
      const areaKm2 = calculatePolygonAreaKm2(polygonCoordinates);
      console.log(`Advisory area: ${areaKm2.toFixed(3)} km²`);

      if (areaKm2 > MAX_ADVISORY_AREA_KM2) {
        console.warn(`Advisory too large: ${areaKm2.toFixed(2)} km² exceeds max ${MAX_ADVISORY_AREA_KM2} km²`);
        return new Response(
          JSON.stringify({ error: 'advisory_too_large', areaKm2, maxAreaKm2: MAX_ADVISORY_AREA_KM2,
            message: `Advisory area (${areaKm2.toFixed(2)} km²) exceeds maximum allowed (${MAX_ADVISORY_AREA_KM2} km²)` }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const isLargeAdvisory = areaKm2 > LARGE_ADVISORY_THRESHOLD_KM2;
      const forcePublish = body.forcePublish === true;
      
      if (isLargeAdvisory && !forcePublish) {
        return new Response(
          JSON.stringify({ warning: 'large_advisory', areaKm2, thresholdKm2: LARGE_ADVISORY_THRESHOLD_KM2,
            maxAreaKm2: MAX_ADVISORY_AREA_KM2, requiresConfirmation: true,
            message: `Advisory area is ${areaKm2.toFixed(2)} km². Areas over ${LARGE_ADVISORY_THRESHOLD_KM2} km² may be impractical. Confirm to proceed.` }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // AMSL calculation: terrain + SORA settings
      const sora = route.soraSettings;
      const flightAltitude = sora?.flightAltitude ?? DEFAULT_FLIGHT_ALTITUDE;
      const contingencyHeight = sora?.contingencyHeight ?? DEFAULT_CONTINGENCY_HEIGHT;

      const maxTerrain = await fetchMaxTerrainElevation(route.coordinates);
      const maxAltitudeAmsl = Math.round(maxTerrain + flightAltitude + contingencyHeight);
      console.log(`Advisory AMSL: terrain=${maxTerrain}m + flight=${flightAltitude}m + contingency=${contingencyHeight}m = ${maxAltitudeAmsl}m`);

      // Dynamic callsign: configurable prefix + variable suffix (counter or drone reg.nr)
      let callSign = 'avisafe01';
      try {
        const { data: company } = await supabase
          .from('companies')
          .select('navn, parent_company_id, safesky_callsign_prefix, safesky_callsign_variable')
          .eq('id', mission.company_id)
          .single();

        let companyName = company?.navn || 'avisafe';
        let prefix = company?.safesky_callsign_prefix as string | null | undefined;
        let variable = (company?.safesky_callsign_variable as string | undefined) || 'counter';

        // If this is a child company, fall back to parent for name + callsign settings
        if (company?.parent_company_id) {
          const { data: parentCompany } = await supabase
            .from('companies')
            .select('navn, safesky_callsign_prefix, safesky_callsign_variable')
            .eq('id', company.parent_company_id)
            .single();
          if (parentCompany?.navn) companyName = parentCompany.navn;
          if (!prefix && parentCompany?.safesky_callsign_prefix) prefix = parentCompany.safesky_callsign_prefix;
          if ((!company?.safesky_callsign_variable) && parentCompany?.safesky_callsign_variable) {
            variable = parentCompany.safesky_callsign_variable;
          }
        }

        // Preserve user-defined prefix casing; only strip invalid SafeSky characters.
        // Fall back to lowercased company name when no prefix is set.
        const rawPrefix = (prefix && prefix.trim()) ? prefix.trim() : companyName.toLowerCase();
        const sanitized = rawPrefix.replace(/[^a-zA-Z0-9]/g, '') || 'avisafe';

        let suffix = '01';
        if (variable === 'drone_registration') {
          const { data: missionDrone } = await supabase
            .from('mission_drones')
            .select('drone_id')
            .eq('mission_id', missionId)
            .limit(1)
            .maybeSingle();
          if (missionDrone?.drone_id) {
            const { data: drone } = await supabase
              .from('drones')
              .select('registration_number, serienummer')
              .eq('id', missionDrone.drone_id)
              .single();
            const reg = drone?.registration_number || drone?.serienummer || '';
            const cleaned = reg.replace(/[^a-z0-9]/gi, '');
            suffix = cleaned || '01';
          }
        } else {
          // counter — count active advisory flights across the parent and all its children
          const parentId = company?.parent_company_id || mission.company_id;
          const { data: siblingCompanies } = await supabase
            .from('companies')
            .select('id')
            .eq('parent_company_id', parentId);
          const hierarchyIds = [parentId, ...(siblingCompanies || []).map(c => c.id)];

          const { data: companyFlights } = await supabase
            .from('active_flights')
            .select('mission_id')
            .in('company_id', hierarchyIds)
            .eq('publish_mode', 'advisory')
            .order('start_time', { ascending: true });

          const index = companyFlights
            ? companyFlights.findIndex(f => f.mission_id === missionId) + 1
            : 1;
          suffix = String(index > 0 ? index : 1).padStart(2, '0');
        }

        callSign = sanitized + suffix;
        console.log(`Generated callsign: ${callSign} (prefix=${prefix || companyName}, variable=${variable}, suffix=${suffix})`);
      } catch (err) {
        console.warn('Callsign generation failed, using fallback:', err);
      }

      // Build remarks: optionally append pilot phone number
      let remarks = "Drone operation - planned route";
      const includePhone = body.includePhoneInRemarks === true;
      const rawPhone = typeof body.phoneNumber === 'string' ? body.phoneNumber : '';
      if (includePhone && rawPhone) {
        // Sanitize: keep digits, +, spaces, dashes, parens. Cap length.
        const cleanPhone = rawPhone.replace(/[^\d+\s()\-]/g, '').trim().slice(0, 32);
        if (cleanPhone) {
          remarks = `${remarks}. Pilot: ${cleanPhone}`;
        }
      }
      // SafeSky-side remarks should also be capped to be safe
      remarks = remarks.slice(0, 200);

      const payload: GeoJSONFeatureCollection = {
        type: "FeatureCollection",
        features: [{
          type: "Feature",
          properties: {
            id: advisoryId,
            call_sign: callSign,
            last_update: Math.floor(Date.now() / 1000),
            max_altitude: maxAltitudeAmsl,
            remarks
          },
          geometry: {
            type: "Polygon",
            coordinates: [polygonCoordinates]
          }
        }]
      };

      console.log('Advisory payload:', JSON.stringify(payload, null, 2));

      const advBody = JSON.stringify(payload);
      const advAuthHeaders = await generateAuthHeaders(ADVISORY_API_KEY, 'POST', SAFESKY_ADVISORY_URL, advBody);
      const response = await fetch(SAFESKY_ADVISORY_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...advAuthHeaders },
        body: advBody
      });

      const responseText = await response.text();
      console.log(`SafeSky Advisory response: ${response.status} - ${responseText}`);

      if (!response.ok) {
        return new Response(
          JSON.stringify({ error: 'SafeSky Advisory API error', status: response.status, details: responseText,
            hint: response.status === 401 || response.status === 403 ? 'HMAC authentication may be required for /v1/advisory' : undefined }),
          { status: response.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      return new Response(
        JSON.stringify({ 
          success: true, action, advisoryId, areaKm2, maxAltitudeAmsl, terrainElevation: maxTerrain,
          message: `Advisory ${action === 'publish_advisory' ? 'published' : 'refreshed'} successfully (${maxAltitudeAmsl}m AMSL)`
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // --- UAV beacon (single point for live position from mission) ---
    if (action === 'publish' || action === 'refresh') {
      if (!missionId) {
        return new Response(
          JSON.stringify({ error: 'missionId is required for publish/refresh' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const { data: mission, error: missionError } = await supabase
        .from('missions')
        .select('id, tittel, route, latitude, longitude')
        .eq('id', missionId)
        .single();

      if (missionError || !mission) {
        console.error('Mission fetch error:', missionError);
        return new Response(
          JSON.stringify({ error: 'Mission not found', details: missionError }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      let latitude: number;
      let longitude: number;

      const route = mission.route as MissionRoute | null;
      if (route && route.coordinates && route.coordinates.length > 0) {
        latitude = route.coordinates[0].lat;
        longitude = route.coordinates[0].lng;
      } else if (mission.latitude && mission.longitude) {
        latitude = mission.latitude;
        longitude = mission.longitude;
      } else {
        return new Response(
          JSON.stringify({ error: 'No location data available' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // AMSL calculation for UAV beacon
      const sora = route?.soraSettings;
      const flightAltitude = sora?.flightAltitude ?? DEFAULT_FLIGHT_ALTITUDE;
      const allCoords = route?.coordinates ?? [{ lat: latitude, lng: longitude }];
      const maxTerrain = await fetchMaxTerrainElevation(allCoords);
      const altitudeAmsl = Math.round(maxTerrain + flightAltitude);
      console.log(`UAV beacon AMSL: terrain=${maxTerrain}m + flight=${flightAltitude}m = ${altitudeAmsl}m`);

      const beaconId = `AVS_${missionId.substring(0, 8)}`;
      const payload = [
        {
          id: beaconId,
          altitude: altitudeAmsl,
          latitude: latitude,
          longitude: longitude
        }
      ];

      console.log('Sending UAV beacon:', JSON.stringify(payload));

      const uavBody = JSON.stringify(payload);
      const uavAuthHeaders = await generateAuthHeaders(SAFESKY_API_KEY, 'POST', SAFESKY_UAV_URL, uavBody);
      const response = await fetch(SAFESKY_UAV_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...uavAuthHeaders },
        body: uavBody
      });

      const responseText = await response.text();
      console.log(`SafeSky UAV response: ${response.status} - ${responseText}`);

      if (!response.ok) {
        return new Response(
          JSON.stringify({ error: 'SafeSky API error', status: response.status, details: responseText }),
          { status: response.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      return new Response(
        JSON.stringify({ 
          success: true, action, beaconId, altitudeAmsl, terrainElevation: maxTerrain,
          message: `UAV beacon ${action === 'publish' ? 'published' : 'refreshed'} successfully (${altitudeAmsl}m AMSL)`
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // --- Delete / expire ---
    if (action === 'delete' || action === 'delete_advisory') {
      console.log('Beacon/advisory will expire automatically (no refresh)');
      return new Response(
        JSON.stringify({ success: true, action, message: 'Beacon/advisory will expire automatically' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ error: 'Invalid action. Use: publish, refresh, publish_advisory, refresh_advisory, publish_live_uav, delete, or delete_advisory' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('SafeSky error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: String(error) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
