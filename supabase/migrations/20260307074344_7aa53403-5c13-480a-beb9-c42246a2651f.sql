ALTER TABLE public.drones
  ADD COLUMN IF NOT EXISTS inspection_interval_hours numeric NULL,
  ADD COLUMN IF NOT EXISTS inspection_interval_missions integer NULL,
  ADD COLUMN IF NOT EXISTS hours_at_last_inspection numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS missions_at_last_inspection integer DEFAULT 0;