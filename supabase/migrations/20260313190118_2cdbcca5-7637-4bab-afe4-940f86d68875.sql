ALTER TABLE equipment
  ADD COLUMN IF NOT EXISTS battery_cycles integer,
  ADD COLUMN IF NOT EXISTS battery_health_pct numeric,
  ADD COLUMN IF NOT EXISTS battery_full_capacity_mah integer,
  ADD COLUMN IF NOT EXISTS battery_max_cell_deviation_v numeric;