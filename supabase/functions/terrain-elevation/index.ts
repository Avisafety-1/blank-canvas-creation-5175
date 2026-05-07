import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function roundKey(lat: number, lng: number): string {
  return `${lat.toFixed(4)},${lng.toFixed(4)}`;
}

function delay(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { positions } = await req.json();
    if (!Array.isArray(positions) || positions.length === 0) {
      return new Response(JSON.stringify({ elevations: [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Generate cache keys (rounded to 4 decimals)
    const keys = positions.map((p: { lat: number; lng: number }) =>
      roundKey(p.lat, p.lng)
    );
    const uniqueKeys = [...new Set(keys)];

    // Look up cached values
    const cached = new Map<string, number>();
    // Query in batches of 500 to avoid URL length limits
    for (let i = 0; i < uniqueKeys.length; i += 500) {
      const batch = uniqueKeys.slice(i, i + 500);
      const { data } = await supabase
        .from("terrain_elevation_cache")
        .select("lat_lng_key, elevation")
        .in("lat_lng_key", batch);
      if (data) {
        data.forEach((row: { lat_lng_key: string; elevation: number }) => {
          cached.set(row.lat_lng_key, row.elevation);
        });
      }
    }

    console.log(
      `[terrain-elevation] ${cached.size}/${uniqueKeys.length} cache hits`
    );

    // Find missing keys
    const missingKeys = uniqueKeys.filter((k) => !cached.has(k));

    if (missingKeys.length > 0) {
      // Parse lat/lng from keys
      const missingPositions = missingKeys.map((k) => {
        const [lat, lng] = k.split(",").map(Number);
        return { lat, lng, key: k };
      });

      // Fetch from Open-Meteo in batches of 100
      const BATCH_SIZE = 100;
      for (let i = 0; i < missingPositions.length; i += BATCH_SIZE) {
        const batch = missingPositions.slice(i, i + BATCH_SIZE);
        const lats = batch.map((p) => p.lat.toFixed(6)).join(",");
        const lngs = batch.map((p) => p.lng.toFixed(6)).join(",");

        if (i > 0) await delay(500);

        let success = false;
        for (let attempt = 0; attempt <= 3; attempt++) {
          if (attempt > 0) {
            const backoffMs = 2000 * Math.pow(2, attempt - 1);
            console.log(
              `[terrain-elevation] Retry ${attempt} for batch ${i}, waiting ${backoffMs}ms`
            );
            await delay(backoffMs);
          }
          try {
            const res = await fetch(
              `https://api.open-meteo.com/v1/elevation?latitude=${lats}&longitude=${lngs}`
            );
            if (res.ok) {
              const data = await res.json();
              const elevations: number[] = data.elevation ?? [];
              batch.forEach((p, idx) => {
                const elev = elevations[idx];
                if (elev != null) {
                  cached.set(p.key, elev);
                }
              });
              success = true;
              break;
            } else {
              console.warn(
                `[terrain-elevation] Batch ${i} HTTP ${res.status}`
              );
            }
          } catch (err) {
            console.warn(`[terrain-elevation] Batch ${i} error:`, err);
          }
        }

        if (!success) {
          console.error(
            `[terrain-elevation] Batch ${i} failed after retries`
          );
        }
      }

      // Store new values in cache
      const newEntries = missingKeys
        .filter((k) => cached.has(k))
        .map((k) => ({
          lat_lng_key: k,
          elevation: cached.get(k)!,
        }));

      if (newEntries.length > 0) {
        // Upsert in batches
        for (let i = 0; i < newEntries.length; i += 500) {
          const batch = newEntries.slice(i, i + 500);
          await supabase
            .from("terrain_elevation_cache")
            .upsert(batch, { onConflict: "lat_lng_key" });
        }
        console.log(
          `[terrain-elevation] Cached ${newEntries.length} new elevations`
        );
      }
    }

    // Build result array in original order
    const elevations = keys.map((k) => cached.get(k) ?? null);

    return new Response(JSON.stringify({ elevations }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[terrain-elevation] Error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
