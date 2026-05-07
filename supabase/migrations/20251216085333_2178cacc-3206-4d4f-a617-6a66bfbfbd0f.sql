-- Add flight_track column to store DroneTag position history
ALTER TABLE flight_logs ADD COLUMN IF NOT EXISTS flight_track jsonb;

-- Add dronetag_device_id reference to flight_logs
ALTER TABLE flight_logs ADD COLUMN IF NOT EXISTS dronetag_device_id uuid REFERENCES dronetag_devices(id);