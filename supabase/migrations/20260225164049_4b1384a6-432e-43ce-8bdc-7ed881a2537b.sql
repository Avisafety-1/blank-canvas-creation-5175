ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS dji_flightlog_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS dronelog_api_key text;