import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Token cache
let cachedToken: { token: string; expiresAt: number } | null = null;

async function getBarentsWatchToken(): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expiresAt) {
    return cachedToken.token;
  }

  const clientId = Deno.env.get("BARENTSWATCH_CLIENT_ID");
  const clientSecret = Deno.env.get("BARENTSWATCH_CLIENT_SECRET");

  if (!clientId || !clientSecret) {
    throw new Error("BARENTSWATCH_CLIENT_ID / BARENTSWATCH_CLIENT_SECRET not configured");
  }

  const res = await fetch("https://id.barentswatch.no/connect/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: clientId,
      client_secret: clientSecret,
      scope: "ais",
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    console.error("[barentswatch-ais] Token error:", res.status, text);
    throw new Error(`Token request failed: ${res.status}`);
  }

  const data = await res.json();
  cachedToken = {
    token: data.access_token,
    expiresAt: Date.now() + (data.expires_in * 1000) - 60_000,
  };
  console.log("[barentswatch-ais] Token obtained");
  return data.access_token;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { bounds } = await req.json();
    if (!bounds || bounds.minLat == null || bounds.minLng == null || bounds.maxLat == null || bounds.maxLng == null) {
      return new Response(JSON.stringify({ error: "Missing bounds" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log("[barentswatch-ais] Bounds:", JSON.stringify(bounds));
    const token = await getBarentsWatchToken();

    const apiUrl = "https://live.ais.barentswatch.no/v1/latest/combined?modelType=Full&modelFormat=Geojson";
    console.log("[barentswatch-ais] Calling:", apiUrl);
    const apiRes = await fetch(apiUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({}),
    });

    if (!apiRes.ok) {
      const text = await apiRes.text();
      console.error("[barentswatch-ais] API error:", apiRes.status, text);

      // If 401, clear token cache and retry once
      if (apiRes.status === 401) {
        cachedToken = null;
        const newToken = await getBarentsWatchToken();
        const retryRes = await fetch(apiUrl, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${newToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({}),
        });
        if (!retryRes.ok) {
          const retryText = await retryRes.text();
          return new Response(JSON.stringify({ error: "AIS API failed after retry", details: retryText }), {
            status: 502,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        const retryData = await retryRes.json();
        const filtered = filterByBounds(retryData, bounds);
        return new Response(JSON.stringify(filtered), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ error: "AIS API failed", details: text }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await apiRes.json();
    const rawCount = Array.isArray(data) ? data.length : data?.features?.length ?? 0;
    console.log("[barentswatch-ais] Response type:", Array.isArray(data) ? "array" : typeof data, "raw count:", rawCount);
    if (rawCount > 0) {
      const sample = Array.isArray(data) ? data[0] : data.features?.[0];
      console.log("[barentswatch-ais] Sample item keys:", Object.keys(sample || {}));
    }
    const filtered = filterByBounds(data, bounds);
    console.log("[barentswatch-ais] Filtered vessels:", filtered.count);

    return new Response(JSON.stringify(filtered), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[barentswatch-ais] Error:", error);
    return new Response(JSON.stringify({ error: "Internal error", details: String(error) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

interface Bounds {
  minLat: number;
  minLng: number;
  maxLat: number;
  maxLng: number;
}

function filterByBounds(data: any, bounds: Bounds) {
  // The API may return GeoJSON FeatureCollection or an array
  // We extract vessels within the bounding box
  const vessels: any[] = [];

  if (data?.features) {
    // GeoJSON FeatureCollection
    for (const feature of data.features) {
      const coords = feature.geometry?.coordinates;
      if (!coords) continue;
      const [lng, lat] = coords;
      if (lat >= bounds.minLat && lat <= bounds.maxLat && lng >= bounds.minLng && lng <= bounds.maxLng) {
        const p = feature.properties || {};
        vessels.push({
          mmsi: p.mmsi,
          name: p.name || p.shipName || "",
          shipType: p.shipType ?? p.shipgroup ?? null,
          lat,
          lon: lng,
          sog: p.sog ?? p.speedOverGround ?? null,
          cog: p.cog ?? p.courseOverGround ?? null,
          heading: p.trueHeading ?? p.heading ?? null,
          destination: p.destination ?? "",
        });
      }
    }
  } else if (Array.isArray(data)) {
    for (const item of data) {
      const lat = item.latitude ?? item.lat;
      const lng = item.longitude ?? item.lon;
      if (lat == null || lng == null) continue;
      if (lat >= bounds.minLat && lat <= bounds.maxLat && lng >= bounds.minLng && lng <= bounds.maxLng) {
        vessels.push({
          mmsi: item.mmsi,
          name: item.name || item.shipName || "",
          shipType: item.shipType ?? item.shipgroup ?? null,
          lat,
          lon: lng,
          sog: item.sog ?? item.speedOverGround ?? null,
          cog: item.cog ?? item.courseOverGround ?? null,
          heading: item.trueHeading ?? item.heading ?? null,
          destination: item.destination ?? "",
        });
      }
    }
  }

  return { vessels, count: vessels.length };
}
