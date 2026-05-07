
-- Extend flight_logs with structured DroneLog fields
ALTER TABLE flight_logs ADD COLUMN IF NOT EXISTS source text DEFAULT 'manual';
ALTER TABLE flight_logs ADD COLUMN IF NOT EXISTS dronelog_sha256 text;
ALTER TABLE flight_logs ADD COLUMN IF NOT EXISTS start_time_utc timestamptz;
ALTER TABLE flight_logs ADD COLUMN IF NOT EXISTS end_time_utc timestamptz;
ALTER TABLE flight_logs ADD COLUMN IF NOT EXISTS total_distance_m numeric;
ALTER TABLE flight_logs ADD COLUMN IF NOT EXISTS max_height_m numeric;
ALTER TABLE flight_logs ADD COLUMN IF NOT EXISTS max_horiz_speed_ms numeric;
ALTER TABLE flight_logs ADD COLUMN IF NOT EXISTS max_vert_speed_ms numeric;
ALTER TABLE flight_logs ADD COLUMN IF NOT EXISTS drone_model text;
ALTER TABLE flight_logs ADD COLUMN IF NOT EXISTS aircraft_serial text;
ALTER TABLE flight_logs ADD COLUMN IF NOT EXISTS battery_cycles integer;
ALTER TABLE flight_logs ADD COLUMN IF NOT EXISTS battery_temp_min_c numeric;
ALTER TABLE flight_logs ADD COLUMN IF NOT EXISTS battery_temp_max_c numeric;
ALTER TABLE flight_logs ADD COLUMN IF NOT EXISTS battery_voltage_min_v numeric;
ALTER TABLE flight_logs ADD COLUMN IF NOT EXISTS gps_sat_min integer;
ALTER TABLE flight_logs ADD COLUMN IF NOT EXISTS gps_sat_max integer;
ALTER TABLE flight_logs ADD COLUMN IF NOT EXISTS rth_triggered boolean DEFAULT false;
ALTER TABLE flight_logs ADD COLUMN IF NOT EXISTS battery_sn text;
ALTER TABLE flight_logs ADD COLUMN IF NOT EXISTS battery_health_pct numeric;
ALTER TABLE flight_logs ADD COLUMN IF NOT EXISTS max_distance_m numeric;
ALTER TABLE flight_logs ADD COLUMN IF NOT EXISTS dronelog_warnings jsonb;

-- Unique index for deduplication on sha256 hash
CREATE UNIQUE INDEX IF NOT EXISTS idx_flight_logs_sha256_company
  ON flight_logs (company_id, dronelog_sha256) WHERE dronelog_sha256 IS NOT NULL;

-- Flight events table
CREATE TABLE IF NOT EXISTS flight_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  flight_log_id uuid NOT NULL REFERENCES flight_logs(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES companies(id),
  t_offset_ms integer,
  type text NOT NULL,
  message text,
  raw_field text,
  raw_value text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE flight_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view flight events from own company"
  ON flight_events FOR SELECT
  USING (company_id = get_user_company_id(auth.uid()));

CREATE POLICY "Approved users can create flight events"
  ON flight_events FOR INSERT
  WITH CHECK (company_id = get_user_company_id(auth.uid())
    AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND approved = true));
