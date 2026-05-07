-- Add callsign column to dronetag_devices
ALTER TABLE dronetag_devices ADD COLUMN IF NOT EXISTS callsign text;

-- Add dronetag_device_id to active_flights for telemetry tracking
ALTER TABLE active_flights ADD COLUMN IF NOT EXISTS dronetag_device_id uuid REFERENCES dronetag_devices(id);

-- Create index for efficient callsign lookups
CREATE INDEX IF NOT EXISTS idx_dronetag_devices_callsign ON dronetag_devices(callsign);

-- Add comment for documentation
COMMENT ON COLUMN dronetag_devices.callsign IS 'SafeSky beacon callsign for matching telemetry data';
COMMENT ON COLUMN active_flights.dronetag_device_id IS 'Optional DroneTag device for live telemetry tracking';