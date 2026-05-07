ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS propagate_sora_buffer_mode boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS propagate_mission_roles boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS propagate_flight_alerts boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS propagate_sora_config boolean NOT NULL DEFAULT false;