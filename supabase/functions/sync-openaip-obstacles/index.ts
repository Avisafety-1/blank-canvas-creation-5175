import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const OPENAIP_API_KEY = Deno.env.get("OPENAIP_API_KEY");
    if (!OPENAIP_API_KEY) {
      throw new Error("OPENAIP_API_KEY not configured");
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const allObstacles: any[] = [];
    let page = 1;
    const limit = 100;
    let hasMore = true;

    while (hasMore) {
      const url = `https://api.core.openaip.net/api/obstacles?country=NO&limit=${limit}&page=${page}`;
      console.log(`Fetching obstacles page ${page}: ${url}`);

      const response = await fetch(url, {
        headers: {
          "x-openaip-api-key": OPENAIP_API_KEY,
          Accept: "application/json",
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`OpenAIP API error ${response.status}: ${errorText}`);
      }

      const data = await response.json();
      const items = data.items || [];
      allObstacles.push(...items);

      console.log(`Page ${page}: got ${items.length} obstacles`);

      if (items.length < limit) {
        hasMore = false;
      } else {
        page++;
      }
    }

    console.log(`Total obstacles fetched: ${allObstacles.length}`);

    // Obstacle type mapping
    const obstacleTypeMap: Record<number, string> = {
      0: "other",
      1: "cable",
      2: "tower",
      3: "chimney",
      4: "mast",
      5: "wind_turbine",
      6: "building",
      7: "church",
      8: "bridge",
      9: "natural",
      10: "pole",
      11: "catenary",
      12: "antenna",
    };

    let synced = 0;
    let errors = 0;

    for (const obstacle of allObstacles) {
      try {
        const openaipId = obstacle._id;
        const name = obstacle.name || null;
        const geometry = obstacle.geometry;

        if (!geometry || !geometry.coordinates) {
          continue;
        }

        const [lng, lat] = geometry.coordinates;
        const obstacleType = obstacleTypeMap[obstacle.type] || "other";
        const elevation = obstacle.elevation?.value ?? null;
        const heightAgl = obstacle.heightAgl?.value ?? null;

        const { error: upsertError } = await supabase
          .from("openaip_obstacles")
          .upsert(
            {
              openaip_id: openaipId,
              name,
              type: obstacleType,
              geometry: `SRID=4326;POINT(${lng} ${lat})`,
              elevation,
              height_agl: heightAgl,
              properties: {
                openaip_type: obstacle.type,
                country: obstacle.country,
                lighted: obstacle.lighted,
              },
              synced_at: new Date().toISOString(),
            },
            { onConflict: "openaip_id" }
          );

        if (upsertError) {
          console.error(`Error upserting obstacle ${openaipId}: ${upsertError.message}`);
          errors++;
        } else {
          synced++;
        }
      } catch (err) {
        errors++;
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`Obstacle error: ${msg}`);
      }
    }

    const summary = {
      total_fetched: allObstacles.length,
      synced,
      errors,
    };

    console.log(`Obstacles sync complete: ${synced} synced, ${errors} errors`);

    return new Response(JSON.stringify(summary), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("Sync error:", msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
