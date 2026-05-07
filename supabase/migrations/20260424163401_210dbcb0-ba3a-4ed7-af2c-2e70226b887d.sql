-- Add is_official flag to filter unofficial club/glider zones
ALTER TABLE public.aip_restriction_zones
ADD COLUMN IF NOT EXISTS is_official BOOLEAN NOT NULL DEFAULT true;

CREATE INDEX IF NOT EXISTS idx_aip_restriction_zones_is_official
ON public.aip_restriction_zones(is_official);

-- Mark known unofficial club/glider/model aircraft ATZ zones as not official
-- These are not on Avinor IPPC and should not trigger SORA warnings
UPDATE public.aip_restriction_zones
SET is_official = false
WHERE zone_type = 'ATZ'
  AND (
    name ILIKE 'GAULDAL%'
    OR name ILIKE 'EGGEMOEN%'
    OR name ILIKE 'GVARV%'
    OR name ILIKE 'STARMOEN%'
  );