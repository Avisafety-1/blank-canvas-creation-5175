ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS propagate_airspace_warnings boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS propagate_hide_reporter boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS propagate_mission_approval boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS propagate_sora_required boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS propagate_deviation_report boolean NOT NULL DEFAULT false;