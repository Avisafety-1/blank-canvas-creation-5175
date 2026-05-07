import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { generateAuthHeaders } from "../_shared/safesky-hmac.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SAFESKY_ADVISORY_URL = 'https://uav-api.safesky.app/v1/advisory';
const SAFESKY_UAV_URL = 'https://sandbox-public-api.safesky.app/v1/uav';

// Norway bounding box for beacon fetching
const NORWAY_BOUNDS = {
  minLat: 57.5,
  maxLat: 71.5,
  minLon: 4.0,
  maxLon: 31.5
};

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

// Default SORA fallback values
const DEFAULT_FLIGHT_ALTITUDE = 120; // meters AGL
const DEFAULT_CONTINGENCY_HEIGHT = 30; // meters

// --- Terrain elevation helpers ---

async function fetchMaxTerrainElevation(coords: RoutePoint[]): Promise<number> {
  if (coords.length === 0) return 0;

  try {
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

    console.log(`Cron terrain elevation: max=${maxElevation}m from ${coords.length} points`);
    return maxElevation;
  } catch (error) {
    console.error('Cron terrain elevation lookup failed, using 0:', error);
    return 0;
  }
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

interface SafeSkyBeacon {
  id: string;
  latitude: number;
  longitude: number;
  altitude?: number;
  course?: number;
  ground_speed?: number;
  vertical_speed?: number;
  beacon_type?: string;
  callsign?: string;
}

// Compute cross product of vectors OA and OB where O is origin
function cross(O: number[], A: number[], B: number[]): number {
  return (A[0] - O[0]) * (B[1] - O[1]) - (A[1] - O[1]) * (B[0] - O[0]);
}

// Compute convex hull using Andrew's monotone chain algorithm
// Returns a closed polygon (first point = last point) in counter-clockwise order
function computeConvexHull(points: number[][]): number[][] {
  if (points.length < 3) {
    // If less than 3 points, just close the polygon
    const result = [...points];
    if (result.length > 0) {
      result.push([...result[0]]);
    }
    return result;
  }

  // Sort points lexicographically (by x, then by y)
  const sorted = [...points].sort((a, b) => a[0] === b[0] ? a[1] - b[1] : a[0] - b[0]);

  // Build lower hull
  const lower: number[][] = [];
  for (const p of sorted) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) {
      lower.pop();
    }
    lower.push(p);
  }

  // Build upper hull
  const upper: number[][] = [];
  for (let i = sorted.length - 1; i >= 0; i--) {
    const p = sorted[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) {
      upper.pop();
    }
    upper.push(p);
  }

  // Remove last point of each half because it's repeated
  lower.pop();
  upper.pop();

  // Concatenate to form full hull
  const hull = [...lower, ...upper];
  
  // Close the polygon
  if (hull.length > 0) {
    hull.push([...hull[0]]);
  }

  return hull;
}

// Convert route coordinates to a valid convex polygon using convex hull
// This prevents self-intersecting polygons that SafeSky rejects
function routeToPolygon(route: MissionRoute): number[][] {
  const coordinates = route.coordinates.map(p => [p.lng, p.lat]);
  return computeConvexHull(coordinates);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  console.log('SafeSky cron refresh started');

  try {
    const SAFESKY_API_KEY = Deno.env.get('SAFESKY_API_KEY');
    const SAFESKY_PROD_API_KEY = Deno.env.get('SAFESKY_PROD_API_KEY');
    if (!SAFESKY_API_KEY) {
      console.error('SAFESKY_API_KEY not configured');
      return new Response(
        JSON.stringify({ error: 'SAFESKY_API_KEY not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    // Use production key for advisory refresh, fall back to sandbox key
    const ADVISORY_API_KEY = SAFESKY_PROD_API_KEY || SAFESKY_API_KEY;
    console.log(`Cron: Using ${SAFESKY_PROD_API_KEY ? 'PRODUCTION' : 'SANDBOX'} key for advisory refresh`);

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // === PART 1: Refresh Advisory flights (polygon-based from route) ===
    const { data: polygonFlights, error: polygonFlightsError } = await supabase
      .from('active_flights')
      .select('id, mission_id, profile_id')
      .eq('publish_mode', 'advisory')
      .not('mission_id', 'is', null);

    if (polygonFlightsError) {
      console.error('Error fetching polygon advisory flights:', polygonFlightsError);
    }

    const advisoryResults: { flightId: string; success: boolean; error?: string }[] = [];

    if (polygonFlights && polygonFlights.length > 0) {
      console.log(`Found ${polygonFlights.length} active polygon advisory flights to refresh`);

      for (const flight of polygonFlights) {
        const missionId = flight.mission_id;
        if (!missionId) continue;

        try {
          const { data: mission, error: missionError } = await supabase
            .from('missions')
            .select('id, tittel, route, company_id')
            .eq('id', missionId)
            .single();

          if (missionError || !mission) {
            console.error(`Mission ${missionId} not found:`, missionError);
            advisoryResults.push({ flightId: flight.id, success: false, error: 'Mission not found' });
            continue;
          }

          const route = mission.route as MissionRoute | null;
          if (!route || !route.coordinates || route.coordinates.length < 3) {
            console.warn(`Mission ${missionId} has no valid route for advisory`);
            advisoryResults.push({ flightId: flight.id, success: false, error: 'No valid route' });
            continue;
          }

          const advisoryId = `AVS_${missionId.substring(0, 8)}`;
          const polygonCoordinates = routeToPolygon(route);

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
              const { data: companyFlights } = await supabase
                .from('active_flights')
                .select('mission_id')
                .eq('company_id', mission.company_id)
                .eq('publish_mode', 'advisory')
                .order('start_time', { ascending: true });

              const index = companyFlights
                ? companyFlights.findIndex(f => f.mission_id === missionId) + 1
                : 1;
              suffix = String(index > 0 ? index : 1).padStart(2, '0');
            }

            callSign = sanitized + suffix;
            console.log(`Cron callsign: ${callSign} (prefix=${prefix || companyName}, variable=${variable}, suffix=${suffix})`);
          } catch (err) {
            console.warn('Cron callsign generation failed, using fallback:', err);
          }

          // AMSL calculation: terrain + SORA settings
          const sora = route.soraSettings;
          const flightAltitude = sora?.flightAltitude ?? DEFAULT_FLIGHT_ALTITUDE;
          const contingencyHeight = sora?.contingencyHeight ?? DEFAULT_CONTINGENCY_HEIGHT;

          const maxTerrain = await fetchMaxTerrainElevation(route.coordinates);
          const maxAltitudeAmsl = Math.round(maxTerrain + flightAltitude + contingencyHeight);
          console.log(`Cron AMSL: terrain=${maxTerrain}m + flight=${flightAltitude}m + contingency=${contingencyHeight}m = ${maxAltitudeAmsl}m`);

          const payload: GeoJSONFeatureCollection = {
            type: "FeatureCollection",
            features: [{
              type: "Feature",
              properties: {
                id: advisoryId,
                call_sign: callSign,
                last_update: Math.floor(Date.now() / 1000),
                max_altitude: maxAltitudeAmsl,
                remarks: "Drone operation - planned route"
              },
              geometry: {
                type: "Polygon",
                coordinates: [polygonCoordinates]
              }
            }]
          };

          console.log(`Refreshing polygon advisory for mission ${missionId} (${mission.tittel})`);

          const cronAdvBody = JSON.stringify(payload);
          const cronAdvHeaders = await generateAuthHeaders(ADVISORY_API_KEY, 'POST', SAFESKY_ADVISORY_URL, cronAdvBody);
          const response = await fetch(SAFESKY_ADVISORY_URL, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...cronAdvHeaders,
            },
            body: cronAdvBody
          });

          const responseText = await response.text();
          console.log(`SafeSky polygon advisory response for ${missionId}: ${response.status} - ${responseText}`);

          if (!response.ok) {
            advisoryResults.push({ flightId: flight.id, success: false, error: `API error: ${response.status}` });
          } else {
            advisoryResults.push({ flightId: flight.id, success: true });
          }

        } catch (err) {
          console.error(`Error refreshing polygon advisory for ${missionId}:`, err);
          advisoryResults.push({ flightId: flight.id, success: false, error: String(err) });
        }
      }
    }

    // NOTE: Part 1B (Point Advisory publishing for live_uav) has been removed.
    // live_uav mode now only fetches beacons around pilot position for DroneTag tracking,
    // and displays pilot position internally on /kart - no SafeSky advisory publishing.

    // === PART 2: Fetch and cache SafeSky beacons around active flights ===
    console.log('Fetching SafeSky beacons around active flights...');
    
    let beaconsUpserted = 0;
    let beaconsDeleted = 0;
    const allBeacons: SafeSkyBeacon[] = [];
    const seenBeaconIds = new Set<string>();

    // Fetch ALL active flights (both advisory and live_uav)
    const { data: allActiveFlights, error: allFlightsError } = await supabase
      .from('active_flights')
      .select('id, mission_id, publish_mode, start_lat, start_lng')
      .in('publish_mode', ['advisory', 'live_uav']);

    if (allFlightsError) {
      console.error('Error fetching all active flights for beacons:', allFlightsError);
    }

    if (allActiveFlights && allActiveFlights.length > 0) {
      console.log(`Found ${allActiveFlights.length} active flights to fetch beacons around`);

      for (const flight of allActiveFlights) {
        let queryLat: number | null = null;
        let queryLng: number | null = null;

        // For live_uav flights: ALWAYS prioritize actual GPS position (start_lat/start_lng)
        // This is where the DroneTag is actually operating
        if (flight.publish_mode === 'live_uav' && flight.start_lat && flight.start_lng) {
          queryLat = flight.start_lat;
          queryLng = flight.start_lng;
          console.log(`Flight ${flight.id}: Using GPS position for live_uav beacon fetch`);
        }
        // For advisory flights: Use mission route/location coordinates
        else if (flight.mission_id) {
          const { data: mission } = await supabase
            .from('missions')
            .select('latitude, longitude, route')
            .eq('id', flight.mission_id)
            .single();

          if (mission) {
            const route = mission.route as MissionRoute | null;
            if (route && route.coordinates && route.coordinates.length > 0) {
              queryLat = route.coordinates[0].lat;
              queryLng = route.coordinates[0].lng;
            } else if (mission.latitude && mission.longitude) {
              queryLat = mission.latitude;
              queryLng = mission.longitude;
            }
          }
        }

        // Fallback to start coordinates if still no coordinates found
        if ((queryLat === null || queryLng === null) && flight.start_lat && flight.start_lng) {
          queryLat = flight.start_lat;
          queryLng = flight.start_lng;
          console.log(`Flight ${flight.id}: Fallback to start coordinates`);
        }

        if (queryLat === null || queryLng === null) {
          console.log(`Flight ${flight.id}: No valid coordinates, skipping beacon fetch`);
          continue;
        }

        const beaconsUrl = `${SAFESKY_UAV_URL}?lat=${queryLat.toFixed(4)}&lng=${queryLng.toFixed(4)}&rad=20000`;
        console.log(`Fetching beacons for flight ${flight.id}: ${beaconsUrl}`);

        try {
          const beaconAuthHeaders = await generateAuthHeaders(SAFESKY_API_KEY, 'GET', beaconsUrl);
          const beaconsResponse = await fetch(beaconsUrl, {
            method: 'GET',
            headers: {
              ...beaconAuthHeaders,
            }
          });

          if (beaconsResponse.ok) {
            const beaconsData = await beaconsResponse.json();
            console.log(`Flight ${flight.id}: Received ${beaconsData?.length || 0} beacons`);

            if (Array.isArray(beaconsData)) {
              for (const beacon of beaconsData) {
                const beaconId = beacon.id || `beacon_${beacon.latitude}_${beacon.longitude}`;
                if (!seenBeaconIds.has(beaconId)) {
                  seenBeaconIds.add(beaconId);
                  allBeacons.push({
                    id: beaconId,
                    latitude: beacon.latitude,
                    longitude: beacon.longitude,
                    altitude: beacon.altitude || null,
                    course: beacon.course || null,
                    ground_speed: beacon.ground_speed || null,
                    vertical_speed: beacon.vertical_speed || null,
                    beacon_type: beacon.beacon_type || beacon.type || null,
                    callsign: beacon.callsign || beacon.call_sign || null,
                  });
                }
              }
            }
          } else {
            const errorText = await beaconsResponse.text();
            console.error(`SafeSky beacons API error for flight ${flight.id}: ${beaconsResponse.status} - ${errorText}`);
          }
        } catch (err) {
          console.error(`Error fetching beacons for flight ${flight.id}:`, err);
        }
      }
    } else {
      console.log('No active flights - skipping beacon fetch');
    }

    // Upsert all collected beacons
    if (allBeacons.length > 0) {
      const beaconsWithTimestamp = allBeacons.map(b => ({
        ...b,
        updated_at: new Date().toISOString()
      }));

      const { error: upsertError } = await supabase
        .from('safesky_beacons')
        .upsert(beaconsWithTimestamp, { onConflict: 'id' });

      if (upsertError) {
        console.error('Error upserting beacons:', upsertError);
      } else {
        beaconsUpserted = allBeacons.length;
        console.log(`Upserted ${beaconsUpserted} unique beacons from all active flights`);
      }
    }

    // === PART 3: Store DroneTag telemetry for active flights ===
    // Uses the safesky_beacons table (populated by safesky-beacons-fetch with full Norway viewport)
    // instead of the local allBeacons array (limited to 20km radius from /v1/uav)
    let telemetryStored = 0;
    {
      console.log('Checking for DroneTag telemetry matches in safesky_beacons table...');
      
      // Fetch active flights with dronetag_device_id
      const { data: flightsWithDronetag } = await supabase
        .from('active_flights')
        .select('id, dronetag_device_id')
        .not('dronetag_device_id', 'is', null);

      if (flightsWithDronetag && flightsWithDronetag.length > 0) {
        for (const flight of flightsWithDronetag) {
          // Get the dronetag device to find callsign
          const { data: device } = await supabase
            .from('dronetag_devices')
            .select('callsign, company_id, device_id')
            .eq('id', flight.dronetag_device_id)
            .single();

          if (!device?.callsign) {
            console.log(`Flight ${flight.id}: DroneTag device has no callsign`);
            continue;
          }

          // Look up matching beacon in safesky_beacons table (case-insensitive)
          // This table covers all of Norway via /v1/beacons endpoint
          const { data: matchingBeacon, error: beaconLookupError } = await supabase
            .from('safesky_beacons')
            .select('*')
            .ilike('callsign', device.callsign)
            .order('updated_at', { ascending: false })
            .limit(1)
            .maybeSingle();

          if (beaconLookupError) {
            console.error(`Error looking up beacon for ${device.callsign}:`, beaconLookupError);
            continue;
          }

          if (matchingBeacon) {
            console.log(`Found beacon match for DroneTag ${device.callsign}: lat=${matchingBeacon.latitude}, lng=${matchingBeacon.longitude}, alt=${matchingBeacon.altitude}`);
            
            // Insert into dronetag_positions
            const { error: insertError } = await supabase
              .from('dronetag_positions')
              .insert({
                device_id: device.device_id,
                timestamp: new Date().toISOString(),
                lat: matchingBeacon.latitude,
                lng: matchingBeacon.longitude,
                alt_msl: matchingBeacon.altitude || null,
                speed: matchingBeacon.ground_speed || null,
                heading: matchingBeacon.course || null,
                vert_speed: matchingBeacon.vertical_speed || null,
                company_id: device.company_id
              });

            if (insertError) {
              console.error(`Error inserting dronetag position for ${device.callsign}:`, insertError);
            } else {
              telemetryStored++;
              console.log(`Stored telemetry for DroneTag ${device.callsign}`);
            }
          } else {
            console.log(`No beacon match found in safesky_beacons for callsign: ${device.callsign}`);
          }
        }
      }
    }

    // Delete old beacons (older than 60 seconds)
    const cutoffTime = new Date(Date.now() - 60000).toISOString();
    const { data: deletedData, error: deleteError } = await supabase
      .from('safesky_beacons')
      .delete()
      .lt('updated_at', cutoffTime)
      .select('id');

    if (deleteError) {
      console.error('Error deleting old beacons:', deleteError);
    } else {
      beaconsDeleted = deletedData?.length || 0;
      console.log(`Deleted ${beaconsDeleted} old beacons`);
    }
    
    console.log(`Telemetry stored: ${telemetryStored} positions`);

    const advisorySuccessCount = advisoryResults.filter(r => r.success).length;
    console.log(`Cron refresh complete: ${advisorySuccessCount}/${advisoryResults.length} advisories, ${beaconsUpserted} beacons cached, ${telemetryStored} telemetry stored`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        advisories: {
          refreshed: advisorySuccessCount,
          total: advisoryResults.length,
          results: advisoryResults
        },
        beacons: {
          upserted: beaconsUpserted,
          deleted: beaconsDeleted
        },
        telemetry: {
          stored: telemetryStored
        }
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('SafeSky cron error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: String(error) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
