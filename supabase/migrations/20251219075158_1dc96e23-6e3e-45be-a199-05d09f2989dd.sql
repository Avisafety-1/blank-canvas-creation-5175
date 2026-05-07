-- Make drone_id nullable in flight_logs
ALTER TABLE flight_logs 
  ALTER COLUMN drone_id DROP NOT NULL;

-- Fix flight_logs drone constraint
ALTER TABLE flight_logs 
  DROP CONSTRAINT IF EXISTS flight_logs_drone_id_fkey;
ALTER TABLE flight_logs 
  ADD CONSTRAINT flight_logs_drone_id_fkey 
  FOREIGN KEY (drone_id) 
  REFERENCES drones(id) 
  ON DELETE SET NULL;