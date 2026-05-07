-- Fix flight_logs constraint
ALTER TABLE flight_logs 
  DROP CONSTRAINT IF EXISTS flight_logs_mission_id_fkey;
ALTER TABLE flight_logs 
  ADD CONSTRAINT flight_logs_mission_id_fkey 
  FOREIGN KEY (mission_id) 
  REFERENCES missions(id) 
  ON DELETE SET NULL;

-- Fix incidents constraint
ALTER TABLE incidents 
  DROP CONSTRAINT IF EXISTS incidents_mission_id_fkey;
ALTER TABLE incidents 
  ADD CONSTRAINT incidents_mission_id_fkey 
  FOREIGN KEY (mission_id) 
  REFERENCES missions(id) 
  ON DELETE SET NULL;

-- Fix active_flights constraint
ALTER TABLE active_flights 
  DROP CONSTRAINT IF EXISTS active_flights_mission_id_fkey;
ALTER TABLE active_flights 
  ADD CONSTRAINT active_flights_mission_id_fkey 
  FOREIGN KEY (mission_id) 
  REFERENCES missions(id) 
  ON DELETE SET NULL;