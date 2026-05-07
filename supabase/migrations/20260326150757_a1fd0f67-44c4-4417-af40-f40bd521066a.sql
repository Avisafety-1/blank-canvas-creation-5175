-- Add unique constraints on external_id for new tables
ALTER TABLE public.naturvern_zones ADD CONSTRAINT naturvern_zones_external_id_key UNIQUE (external_id);
ALTER TABLE public.vern_restriction_zones ADD CONSTRAINT vern_restriction_zones_external_id_key UNIQUE (external_id);

-- Add updated_at column to match the upsert RPC expectations
ALTER TABLE public.naturvern_zones ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();
ALTER TABLE public.vern_restriction_zones ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();