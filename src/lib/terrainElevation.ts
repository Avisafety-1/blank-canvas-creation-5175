// Utility for fetching terrain elevation data via Edge Function (with Open-Meteo fallback)
// and computing AGL / cumulative distance for flight tracks

import { supabase } from "@/integrations/supabase/client";

export interface TerrainPoint {
  lat: number;
  lng: number;
  distance: number; // cumulative km along route
  alt_msl: number | null;
  terrain_elevation: number | null;
  agl: number | null;
  speed: number | null;
  heading: number | null;
  vert_speed: number | null;
  timestamp: string | null;
}

/** Haversine distance in km between two lat/lng points */
function haversine(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** Small helper to wait ms */
function delay(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

/** Downsample positions to at most maxPoints evenly spaced indices */
export function downsamplePositions<T>(
  positions: T[],
  maxPoints = 80
): { sampled: T[]; indices: number[] } {
  if (positions.length <= maxPoints) {
    return { sampled: [...positions], indices: positions.map((_, i) => i) };
  }
  const indices: number[] = [0];
  const step = (positions.length - 1) / (maxPoints - 1);
  for (let i = 1; i < maxPoints - 1; i++) {
    indices.push(Math.round(step * i));
  }
  indices.push(positions.length - 1);
  // Deduplicate (in case rounding produced duplicates)
  const unique = [...new Set(indices)].sort((a, b) => a - b);
  return { sampled: unique.map((i) => positions[i]), indices: unique };
}

/** Interpolate elevations back to full length from sampled indices */
export function interpolateElevations(
  sampledElevations: (number | null)[],
  sampledIndices: number[],
  totalCount: number
): (number | null)[] {
  const result: (number | null)[] = new Array(totalCount).fill(null);

  // Place known values
  sampledIndices.forEach((idx, i) => {
    result[idx] = sampledElevations[i];
  });

  // Linear interpolation between known values
  for (let s = 0; s < sampledIndices.length - 1; s++) {
    const startIdx = sampledIndices[s];
    const endIdx = sampledIndices[s + 1];
    const startVal = sampledElevations[s];
    const endVal = sampledElevations[s + 1];
    if (startVal == null || endVal == null) continue;
    for (let i = startIdx + 1; i < endIdx; i++) {
      const t = (i - startIdx) / (endIdx - startIdx);
      result[i] = startVal + t * (endVal - startVal);
    }
  }

  return result;
}

/** Fetch terrain elevations via Edge Function, with direct API fallback */
export async function fetchTerrainElevations(
  positions: { lat: number; lng: number }[],
  signal?: AbortSignal
): Promise<(number | null)[]> {
  if (positions.length === 0) return [];

  // Try edge function first
  try {
    console.log(`[Terrain] Calling edge function for ${positions.length} positions`);
    const { data, error } = await supabase.functions.invoke("terrain-elevation", {
      body: { positions },
    });

    if (signal?.aborted) return positions.map(() => null);

    if (!error && data?.elevations) {
      const elevations: (number | null)[] = data.elevations;
      const validCount = elevations.filter((e) => e != null).length;
      console.log(`[Terrain] Edge function returned ${validCount}/${elevations.length} elevations`);
      if (validCount > 0) return elevations;
    } else {
      console.warn("[Terrain] Edge function error:", error);
    }
  } catch (err) {
    console.warn("[Terrain] Edge function call failed:", err);
  }

  if (signal?.aborted) return positions.map(() => null);

  // Fallback: direct Open-Meteo with long backoff
  console.log("[Terrain] Falling back to direct Open-Meteo API");
  const BATCH_SIZE = 100;
  const MAX_RETRIES = 3;
  const elevations: (number | null)[] = [];

  for (let i = 0; i < positions.length; i += BATCH_SIZE) {
    if (signal?.aborted) return positions.map(() => null);

    const batch = positions.slice(i, i + BATCH_SIZE);
    const lats = batch.map((p) => p.lat.toFixed(6)).join(",");
    const lngs = batch.map((p) => p.lng.toFixed(6)).join(",");

    if (i > 0) await delay(2000);

    let success = false;
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      if (signal?.aborted) return positions.map(() => null);
      if (attempt > 0) {
        const backoffMs = 10000 * Math.pow(2, attempt - 1); // 10s, 20s, 40s
        console.log(`[Terrain] Fallback retry ${attempt}, waiting ${backoffMs}ms`);
        await delay(backoffMs);
      }
      try {
        const res = await fetch(
          `https://api.open-meteo.com/v1/elevation?latitude=${lats}&longitude=${lngs}`,
          { signal }
        );
        if (res.ok) {
          const data = await res.json();
          const elev: number[] = data.elevation ?? [];
          batch.forEach((_, idx) => elevations.push(elev[idx] ?? null));
          success = true;
          break;
        }
      } catch (err) {
        if (signal?.aborted) return positions.map(() => null);
        console.warn(`[Terrain] Fallback batch ${i} error:`, err);
      }
    }
    if (!success) {
      batch.forEach(() => elevations.push(null));
    }
  }

  return elevations;
}

/** Build terrain profile data for a flight track */
export function buildTerrainProfile(
  positions: {
    lat: number;
    lng: number;
    alt?: number;
    alt_msl?: number;
    speed?: number;
    heading?: number;
    vert_speed?: number;
    timestamp?: string;
  }[],
  terrainElevations: (number | null)[]
): TerrainPoint[] {
  let cumDist = 0;
  return positions.map((pos, i) => {
    if (i > 0) {
      cumDist += haversine(
        positions[i - 1].lat,
        positions[i - 1].lng,
        pos.lat,
        pos.lng
      );
    }
    const altMsl = pos.alt_msl ?? pos.alt ?? null;
    const terrain = terrainElevations[i] ?? null;
    const agl = altMsl != null && terrain != null ? altMsl - terrain : null;

    return {
      lat: pos.lat,
      lng: pos.lng,
      distance: Math.round(cumDist * 1000) / 1000, // 3 decimal km
      alt_msl: altMsl,
      terrain_elevation: terrain,
      agl,
      speed: pos.speed ?? null,
      heading: pos.heading ?? null,
      vert_speed: pos.vert_speed ?? null,
      timestamp: pos.timestamp ?? null,
    };
  });
}
