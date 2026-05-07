import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Norway bounding box for beacon fetching
const NORWAY_VIEWPORT = "57.5,4.0,71.5,31.5";
const SAFESKY_HOST = "sandbox-public-api.safesky.app";
const SAFESKY_PATH = "/v1/beacons";
// Include grounded traffic (default is false, which filters out GROUNDED beacons)
const SAFESKY_QUERY = `viewport=${NORWAY_VIEWPORT}&return_grounded_traffic=true`;
const SAFESKY_BEACONS_URL = `https://${SAFESKY_HOST}${SAFESKY_PATH}?${SAFESKY_QUERY}`;

// How long a heartbeat is considered "active" (45 seconds — matches 30s client interval + margin)
const HEARTBEAT_TIMEOUT_MS = 120000;

// How old beacons should be before deletion (30 seconds)
const BEACON_MAX_AGE_MS = 60000;

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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  console.log('SafeSky beacons fetch started');

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Step 1: Check if there are active map viewers (heartbeat within last 10 seconds)
    const heartbeatCutoff = new Date(Date.now() - HEARTBEAT_TIMEOUT_MS).toISOString();
    
    const { data: activeViewers, error: viewersError } = await supabase
      .from('map_viewer_heartbeats')
      .select('id')
      .gt('last_seen', heartbeatCutoff)
      .limit(1);

    if (viewersError) {
      console.error('Error checking for active viewers:', viewersError);
      return new Response(
        JSON.stringify({ error: 'Failed to check for active viewers', details: viewersError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Also check if there are active flights with dronetag devices
    // (need beacons for telemetry matching even if no one is viewing the map)
    const { data: activeDronetagFlights, error: dronetagFlightsError } = await supabase
      .from('active_flights')
      .select('id')
      .not('dronetag_device_id', 'is', null)
      .limit(1);

    if (dronetagFlightsError) {
      console.error('Error checking for dronetag flights:', dronetagFlightsError);
    }

    const hasActiveViewers = activeViewers && activeViewers.length > 0;
    const hasActiveDronetagFlights = activeDronetagFlights && activeDronetagFlights.length > 0;

    // If no active viewers AND no active dronetag flights, skip API call to save quota.
    // Only run cleanup when there might be stale rows (check first via cheap indexed SELECT).
    if (!hasActiveViewers && !hasActiveDronetagFlights) {
      const beaconCutoff = new Date(Date.now() - BEACON_MAX_AGE_MS).toISOString();
      let deletedCount = 0;

      const { data: stale } = await supabase
        .from('safesky_beacons')
        .select('id')
        .lt('updated_at', beaconCutoff)
        .limit(1);

      if (stale && stale.length > 0) {
        const { data: deletedBeacons } = await supabase
          .from('safesky_beacons')
          .delete()
          .lt('updated_at', beaconCutoff)
          .select('id');
        deletedCount = deletedBeacons?.length || 0;
        if (deletedCount > 0) {
          console.log(`Cleaned up ${deletedCount} old beacons`);
        }
      }

      return new Response(
        JSON.stringify({
          success: true,
          skipped: true,
          reason: 'No active map viewers or dronetag flights',
          beaconsDeleted: deletedCount
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const reason = hasActiveViewers ? 'active map viewer(s)' : 'active dronetag flight(s)';
    console.log(`Fetching beacons from SafeSky (reason: ${reason})`);

    // (log line replaced by reason-based log above)

    // Step 2: Fetch beacons from SafeSky Sandbox API with HMAC authentication
    const SAFESKY_BEACONS_API_KEY = Deno.env.get('SAFESKY_BEACONS_API_KEY');
    if (!SAFESKY_BEACONS_API_KEY) {
      console.error('SAFESKY_BEACONS_API_KEY not configured');
      return new Response(
        JSON.stringify({ error: 'SAFESKY_BEACONS_API_KEY not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Calling SafeSky Sandbox API:', SAFESKY_BEACONS_URL);

    const response = await fetch(SAFESKY_BEACONS_URL, {
      method: 'GET',
      headers: {
        'x-api-key': SAFESKY_BEACONS_API_KEY,
      }
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`SafeSky API error: ${response.status} - ${errorText}`);
      return new Response(
        JSON.stringify({ error: 'SafeSky API error', status: response.status, details: errorText }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const beaconsData = await response.json();
    console.log(`Received ${beaconsData?.length || 0} beacons from SafeSky`);

    // Step 3: Transform and upsert beacons
    const beacons: SafeSkyBeacon[] = [];
    if (Array.isArray(beaconsData)) {
      for (const beacon of beaconsData) {
        const beaconId = beacon.id || `beacon_${beacon.latitude}_${beacon.longitude}`;
        beacons.push({
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

    let beaconsUpserted = 0;
    if (beacons.length > 0) {
      const beaconsWithTimestamp = beacons.map(b => ({
        ...b,
        updated_at: new Date().toISOString()
      }));

      const { error: upsertError } = await supabase
        .from('safesky_beacons')
        .upsert(beaconsWithTimestamp, { onConflict: 'id' });

      if (upsertError) {
        console.error('Error upserting beacons:', upsertError);
      } else {
        beaconsUpserted = beacons.length;
        console.log(`Upserted ${beaconsUpserted} beacons`);
      }
    }

    // Step 4: Delete old beacons (older than 30 seconds)
    const beaconCutoff = new Date(Date.now() - BEACON_MAX_AGE_MS).toISOString();
    const { data: deletedBeacons, error: deleteError } = await supabase
      .from('safesky_beacons')
      .delete()
      .lt('updated_at', beaconCutoff)
      .select('id');

    if (deleteError) {
      console.error('Error deleting old beacons:', deleteError);
    }

    const beaconsDeleted = deletedBeacons?.length || 0;
    if (beaconsDeleted > 0) {
      console.log(`Deleted ${beaconsDeleted} old beacons`);
    }

    console.log(`SafeSky beacons fetch complete: ${beaconsUpserted} upserted, ${beaconsDeleted} deleted`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        beaconsUpserted,
        beaconsDeleted,
        activeViewers: activeViewers.length
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('SafeSky beacons fetch error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: String(error) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
