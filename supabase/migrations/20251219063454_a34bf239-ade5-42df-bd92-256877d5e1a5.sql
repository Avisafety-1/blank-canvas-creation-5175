-- Drop existing foreign key constraint
ALTER TABLE flight_logs 
  DROP CONSTRAINT IF EXISTS flight_logs_dronetag_device_id_fkey;

-- Add new constraint with ON DELETE SET NULL
ALTER TABLE flight_logs 
  ADD CONSTRAINT flight_logs_dronetag_device_id_fkey 
  FOREIGN KEY (dronetag_device_id) 
  REFERENCES dronetag_devices(id) 
  ON DELETE SET NULL;