ALTER TABLE company_sora_config
  ADD COLUMN IF NOT EXISTS min_temp_c numeric DEFAULT -10,
  ADD COLUMN IF NOT EXISTS max_temp_c numeric DEFAULT 40,
  ADD COLUMN IF NOT EXISTS allow_bvlos boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS allow_night_flight boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS max_pilot_inactivity_days integer DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS max_population_density_per_km2 integer DEFAULT NULL;