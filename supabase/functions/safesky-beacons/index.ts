import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { generateAuthHeaders } from "../_shared/safesky-hmac.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { lat, lon } = await req.json();
    
    if (lat === undefined || lon === undefined) {
      console.error('Missing required parameters: lat, lon');
      return new Response(
        JSON.stringify({ error: 'Missing required parameters: lat, lon' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const safeskyApiKey = Deno.env.get('SAFESKY_API_KEY');
    if (!safeskyApiKey) {
      console.error('SAFESKY_API_KEY not configured');
      return new Response(
        JSON.stringify({ error: 'SafeSky API key not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Truncate to 4 decimal precision as required by SafeSky API
    const latTrunc = lat.toFixed(4);
    const lngTrunc = lon.toFixed(4);
    const radius = 20000; // Max radius 20km

    console.log(`Fetching SafeSky UAVs at lat=${latTrunc}, lng=${lngTrunc}, rad=${radius}`);

    // GET /v1/uav - fetch nearby aircraft
    const safeskyUrl = `https://sandbox-public-api.safesky.app/v1/uav?lat=${latTrunc}&lng=${lngTrunc}&rad=${radius}`;
    
    const authHeaders = await generateAuthHeaders(safeskyApiKey, 'GET', safeskyUrl);
    const response = await fetch(safeskyUrl, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'Avisafe/1.0 (kontakt@avisafe.no)',
        ...authHeaders,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`SafeSky API error: ${response.status} - ${errorText}`);
      return new Response(
        JSON.stringify({ error: `SafeSky API error: ${response.status}`, details: errorText }),
        { status: response.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const data = await response.json();
    console.log(`SafeSky returned ${Array.isArray(data) ? data.length : 0} aircraft`);

    return new Response(
      JSON.stringify(data),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in safesky-beacons function:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: String(error) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
