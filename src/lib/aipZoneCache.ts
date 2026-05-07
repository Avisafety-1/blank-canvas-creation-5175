import { supabase } from "@/integrations/supabase/client";

interface AipZone {
  zone_id: string;
  zone_type: string;
  name: string | null;
  upper_limit: string | null;
  lower_limit: string | null;
  remarks: string | null;
  geometry: unknown;
}

const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

let cachedPromise: Promise<AipZone[]> | null = null;
let cachedAt = 0;

/**
 * Returns AIP restriction zones from a shared singleton cache.
 * All callers share one request; cache expires after 5 minutes.
 */
export function getAipZones(): Promise<AipZone[]> {
  const now = Date.now();
  if (cachedPromise && now - cachedAt < CACHE_TTL) {
    return cachedPromise;
  }

  cachedAt = now;
  cachedPromise = (supabase
    .from('aip_restriction_zones')
    .select('zone_id, zone_type, name, upper_limit, lower_limit, remarks, geometry')
    .eq('is_official', true)
    .then(({ data, error }) => {
      if (error) {
        // Reset cache on error so next caller retries
        cachedPromise = null;
        cachedAt = 0;
        console.error('aipZoneCache: fetch failed', error);
        return [];
      }
      return (data ?? []) as AipZone[];
    })) as Promise<AipZone[]>;

  return cachedPromise;
}
