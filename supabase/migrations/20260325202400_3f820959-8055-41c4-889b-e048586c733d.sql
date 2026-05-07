ALTER TABLE public.company_sora_config
  ADD COLUMN IF NOT EXISTS sora_based_approval boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS sora_approval_threshold numeric(3,1) NOT NULL DEFAULT 7.0,
  ADD COLUMN IF NOT EXISTS sora_hardstop_requires_approval boolean NOT NULL DEFAULT true;