-- Add columns to active_flights for live_uav Point advisory
ALTER TABLE active_flights
ADD COLUMN IF NOT EXISTS start_lat double precision,
ADD COLUMN IF NOT EXISTS start_lng double precision,
ADD COLUMN IF NOT EXISTS pilot_name text;