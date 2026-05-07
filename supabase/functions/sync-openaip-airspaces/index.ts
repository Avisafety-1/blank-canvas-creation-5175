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

    // Type mapping: OpenAIP type -> zone_type
    // Based on actual API data for Norway:
    // 0=Other, 1=R, 2=D, 3=P, 4=CTR, 5=D, 6=RMZ, 7=TMA
    // 21=ATZ-like (airfields), 23=TIZ, 24=TIA, 26=CTA, 27=ACC, 28=Airwork
    const typeMap: Record<number, string> = {
      0: "P",    // Other/unknown -> Prohibited
      1: "R",    // Restricted
      2: "D",    // Danger
      3: "P",    // Prohibited
      4: "CTR",  // Control Zone (CTR) - include for completeness
      5: "D",    // Danger
      6: "RMZ",  // Radio Mandatory Zone (confirmed: Geiteryggen, Ekofisk, Kjeller, Oslo)
      21: "ATZ", // Aerodrome Traffic Zone (Eggemoen, Gauldal, Gvarv etc.)
      23: "TIZ", // Traffic Information Zone (Anda, Båtsfjord, Berlevåg etc.)
    };

    // Types to INCLUDE (filter in code, not via API)
    // Include P/R/D zones (0,1,2,3,5), RMZ (6), ATZ (21), TIZ (23)
    // Exclude CTR (4) and TMA (7) - already covered by ArcGIS
    // Exclude TIA (24), CTA (26), ACC (27), Airwork (28), OCA (15)
    const includedTypes = new Set([0, 1, 2, 3, 5, 6, 21, 23]);

    // Names that are unofficial (model aircraft / glider clubs not on Avinor IPPC)
    // Will be flagged is_official=false after upsert.
    const UNOFFICIAL_NAME_PATTERNS = [
      /^GAULDAL/i,
      /^EGGEMOEN/i,
      /^GVARV/i,
      /^STARMOEN/i,
    ];

    // Fetch ALL airspaces for Norway (no type filter - API filter is unreliable)
    const allAirspaces: any[] = [];
    let page = 1;
    const limit = 100;
    let hasMore = true;

    while (hasMore) {
      const url = `https://api.core.openaip.net/api/airspaces?country=NO&limit=${limit}&page=${page}`;
      console.log(`Fetching page ${page}: ${url}`);

      const response = await fetch(url, {
        headers: {
          "x-openaip-api-key": OPENAIP_API_KEY,
          Accept: "application/json",
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `OpenAIP API error ${response.status}: ${errorText}`
        );
      }

      const data = await response.json();
      const items = data.items || [];
      allAirspaces.push(...items);

      console.log(`Page ${page}: got ${items.length} airspaces`);

      if (items.length < limit) {
        hasMore = false;
      } else {
        page++;
      }
    }

    console.log(`Total airspaces fetched: ${allAirspaces.length}`);

    // Log type statistics
    const typeStats: Record<number, { count: number; names: string[] }> = {};
    for (const airspace of allAirspaces) {
      const t = airspace.type;
      if (!typeStats[t]) {
        typeStats[t] = { count: 0, names: [] };
      }
      typeStats[t].count++;
      if (typeStats[t].names.length < 5) {
        typeStats[t].names.push(airspace.name || "unnamed");
      }
    }
    console.log("=== TYPE STATISTICS ===");
    for (const [type, stats] of Object.entries(typeStats)) {
      console.log(`Type ${type}: ${stats.count} airspaces. Examples: ${stats.names.join(", ")}`);
    }

    // Filter to only included types
    const filteredAirspaces = allAirspaces.filter(a => includedTypes.has(a.type));
    const excludedCount = allAirspaces.length - filteredAirspaces.length;
    console.log(`After filtering: ${filteredAirspaces.length} included, ${excludedCount} excluded`);

    let synced = 0;
    let errors = 0;
    const details: string[] = [];

    for (const airspace of filteredAirspaces) {
      try {
        const openaipId = airspace._id;
        const name = airspace.name || "Ukjent";
        const airspaceType = airspace.type;
        const geometry = airspace.geometry;

        if (!geometry) {
          console.warn(`Skipping ${name}: no geometry`);
          continue;
        }

        // Map type, with name-based override for CTR zones
        let zoneType = typeMap[airspaceType] || "D";
        if (name.toUpperCase().includes("CTR")) {
          zoneType = "CTR";
        }

        // Extract zone_id from name
        // Match EN-R102, EN-D303 etc.
        const enMatch = name.match(/EN-[RPDA]\d+[A-Z]?/i);
        // Or use name-based ID for RMZ/TMZ/ATZ/TIZ
        let zoneId: string;
        if (enMatch) {
          zoneId = enMatch[0].toUpperCase();
        } else if (["RMZ", "ATZ", "TIZ", "CTR"].includes(zoneType)) {
          // e.g. "GEITERYGGEN RMZ" -> "GEITERYGGEN-RMZ"
          // e.g. "KJELLER RMZ/TMZ" -> "KJELLER-RMZ"
          // Remove leading "NO" prefix if present
          const cleanName = name
            .replace(/^NO/, "")
            .replace(/\s+(RMZ|TMZ|ATZ|TIZ|RMZ\/TMZ|CTR)$/i, "")
            .trim();
          zoneId = `${cleanName}-${zoneType}`.toUpperCase();
        } else {
          zoneId = `OPENAIP-${openaipId}`;
        }

        // Format limits
        const upperLimit = airspace.upperLimit
          ? `${airspace.upperLimit.value} ${airspace.upperLimit.unit === 1 ? "ft" : "m"} ${airspace.upperLimit.referenceDatum === 1 ? "MSL" : "AGL"}`
          : null;
        const lowerLimit = airspace.lowerLimit
          ? `${airspace.lowerLimit.value} ${airspace.lowerLimit.unit === 1 ? "ft" : "m"} ${airspace.lowerLimit.referenceDatum === 1 ? "MSL" : "AGL"}`
          : null;

        // Upsert using RPC to handle PostGIS geometry
        const { error: upsertError } = await supabase.rpc(
          "upsert_openaip_airspace",
          {
            p_openaip_id: openaipId,
            p_zone_id: zoneId,
            p_zone_type: zoneType,
            p_name: name,
            p_geometry_geojson: JSON.stringify(geometry),
            p_upper_limit: upperLimit,
            p_lower_limit: lowerLimit,
            p_remarks: airspace.remarks || null,
            p_properties: JSON.stringify({
              openaip_type: airspaceType,
              country: airspace.country,
              icaoClass: airspace.icaoClass,
            }),
          }
        );

        if (upsertError) {
          console.error(`Error upserting ${zoneId}: ${upsertError.message}`);
          errors++;
          details.push(`❌ ${zoneId}: ${upsertError.message}`);
        } else {
          synced++;
          details.push(`✅ ${zoneId} (${name}) [type=${airspaceType}/${zoneType}]`);
        }
      } catch (err) {
        errors++;
        const msg = err instanceof Error ? err.message : String(err);
        details.push(`❌ ${airspace.name || "unknown"}: ${msg}`);
      }
    }

    const summary = {
      total_fetched: allAirspaces.length,
      filtered: filteredAirspaces.length,
      excluded: excludedCount,
      synced,
      errors,
      type_stats: typeStats,
      details: details.slice(0, 50),
    };

    console.log(`Sync complete: ${synced} synced, ${errors} errors`);

    // Re-flag known unofficial club/glider zones after upsert
    try {
      const { error: flagError } = await supabase
        .from("aip_restriction_zones")
        .update({ is_official: false })
        .or(
          UNOFFICIAL_NAME_PATTERNS.map(
            (re) => `name.ilike.${re.source.replace(/^\^/, "")}%`
          ).join(",")
        );
      if (flagError) {
        console.warn("Could not re-flag unofficial zones:", flagError.message);
      } else {
        console.log("Re-flagged unofficial club/glider zones as is_official=false");
      }
    } catch (e) {
      console.warn("Re-flag step failed:", e);
    }

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
