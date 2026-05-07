
-- Add source and openaip_id columns to aip_restriction_zones
ALTER TABLE aip_restriction_zones 
  ADD COLUMN IF NOT EXISTS source text DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS openaip_id text;

-- Create unique index on openaip_id for upsert operations
CREATE UNIQUE INDEX IF NOT EXISTS idx_aip_restriction_zones_openaip_id 
  ON aip_restriction_zones (openaip_id) WHERE openaip_id IS NOT NULL;
