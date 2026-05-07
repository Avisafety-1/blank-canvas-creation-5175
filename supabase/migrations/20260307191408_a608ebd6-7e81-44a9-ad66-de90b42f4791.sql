ALTER TABLE equipment
  ADD COLUMN IF NOT EXISTS inspection_interval_hours numeric DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS inspection_interval_missions integer DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS hours_at_last_maintenance numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS missions_at_last_maintenance integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS varsel_timer numeric DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS varsel_oppdrag integer DEFAULT NULL;