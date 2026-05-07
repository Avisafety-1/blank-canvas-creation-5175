-- Add flyvetimer column to equipment table
ALTER TABLE equipment ADD COLUMN IF NOT EXISTS flyvetimer integer NOT NULL DEFAULT 0;

-- Create drone_personnel junction table
CREATE TABLE IF NOT EXISTS drone_personnel (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  drone_id uuid NOT NULL REFERENCES drones(id) ON DELETE CASCADE,
  profile_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  UNIQUE(drone_id, profile_id)
);

-- Enable RLS on drone_personnel
ALTER TABLE drone_personnel ENABLE ROW LEVEL SECURITY;

-- RLS policies for drone_personnel
CREATE POLICY "Users can view drone personnel from own company"
ON drone_personnel FOR SELECT
USING (EXISTS (
  SELECT 1 FROM drones 
  WHERE drones.id = drone_personnel.drone_id 
  AND drones.company_id = get_user_company_id(auth.uid())
));

CREATE POLICY "Approved users can create drone personnel in own company"
ON drone_personnel FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM drones 
    WHERE drones.id = drone_personnel.drone_id 
    AND drones.company_id = get_user_company_id(auth.uid())
    AND drones.user_id = auth.uid()
  )
  AND EXISTS (
    SELECT 1 FROM profiles 
    WHERE profiles.id = auth.uid() 
    AND profiles.approved = true
  )
);

CREATE POLICY "Admins can manage all drone personnel in own company"
ON drone_personnel FOR ALL
USING (
  has_role(auth.uid(), 'admin'::app_role)
  AND EXISTS (
    SELECT 1 FROM drones 
    WHERE drones.id = drone_personnel.drone_id 
    AND drones.company_id = get_user_company_id(auth.uid())
  )
);

CREATE POLICY "Users can delete own drone personnel"
ON drone_personnel FOR DELETE
USING (EXISTS (
  SELECT 1 FROM drones 
  WHERE drones.id = drone_personnel.drone_id 
  AND drones.user_id = auth.uid()
  AND drones.company_id = get_user_company_id(auth.uid())
));

-- Create flight_logs table
CREATE TABLE IF NOT EXISTS flight_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id),
  user_id uuid NOT NULL,
  drone_id uuid NOT NULL REFERENCES drones(id),
  mission_id uuid REFERENCES missions(id),
  departure_location text NOT NULL,
  landing_location text NOT NULL,
  flight_duration_minutes integer NOT NULL,
  movements integer NOT NULL DEFAULT 1,
  flight_date timestamptz NOT NULL DEFAULT now(),
  notes text,
  created_at timestamptz DEFAULT now()
);

-- Enable RLS on flight_logs
ALTER TABLE flight_logs ENABLE ROW LEVEL SECURITY;

-- RLS policies for flight_logs
CREATE POLICY "Users can view flight logs from own company"
ON flight_logs FOR SELECT
USING (company_id = get_user_company_id(auth.uid()));

CREATE POLICY "Approved users can create flight logs in own company"
ON flight_logs FOR INSERT
WITH CHECK (
  auth.uid() = user_id
  AND company_id = get_user_company_id(auth.uid())
  AND EXISTS (
    SELECT 1 FROM profiles 
    WHERE profiles.id = auth.uid() 
    AND profiles.approved = true
  )
);

CREATE POLICY "Users can update own flight logs"
ON flight_logs FOR UPDATE
USING (auth.uid() = user_id AND company_id = get_user_company_id(auth.uid()));

CREATE POLICY "Users can delete own flight logs"
ON flight_logs FOR DELETE
USING (auth.uid() = user_id AND company_id = get_user_company_id(auth.uid()));

CREATE POLICY "Admins can manage all flight logs in own company"
ON flight_logs FOR ALL
USING (
  has_role(auth.uid(), 'admin'::app_role)
  AND company_id = get_user_company_id(auth.uid())
);

-- Create flight_log_equipment junction table
CREATE TABLE IF NOT EXISTS flight_log_equipment (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  flight_log_id uuid NOT NULL REFERENCES flight_logs(id) ON DELETE CASCADE,
  equipment_id uuid NOT NULL REFERENCES equipment(id) ON DELETE CASCADE,
  UNIQUE(flight_log_id, equipment_id)
);

-- Enable RLS on flight_log_equipment
ALTER TABLE flight_log_equipment ENABLE ROW LEVEL SECURITY;

-- RLS policies for flight_log_equipment
CREATE POLICY "Users can view flight log equipment from own company"
ON flight_log_equipment FOR SELECT
USING (EXISTS (
  SELECT 1 FROM flight_logs 
  WHERE flight_logs.id = flight_log_equipment.flight_log_id 
  AND flight_logs.company_id = get_user_company_id(auth.uid())
));

CREATE POLICY "Approved users can create flight log equipment"
ON flight_log_equipment FOR INSERT
WITH CHECK (EXISTS (
  SELECT 1 FROM flight_logs 
  WHERE flight_logs.id = flight_log_equipment.flight_log_id 
  AND flight_logs.user_id = auth.uid()
));

CREATE POLICY "Users can delete own flight log equipment"
ON flight_log_equipment FOR DELETE
USING (EXISTS (
  SELECT 1 FROM flight_logs 
  WHERE flight_logs.id = flight_log_equipment.flight_log_id 
  AND flight_logs.user_id = auth.uid()
));

-- Create flight_log_personnel junction table
CREATE TABLE IF NOT EXISTS flight_log_personnel (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  flight_log_id uuid NOT NULL REFERENCES flight_logs(id) ON DELETE CASCADE,
  profile_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  UNIQUE(flight_log_id, profile_id)
);

-- Enable RLS on flight_log_personnel
ALTER TABLE flight_log_personnel ENABLE ROW LEVEL SECURITY;

-- RLS policies for flight_log_personnel
CREATE POLICY "Users can view flight log personnel from own company"
ON flight_log_personnel FOR SELECT
USING (EXISTS (
  SELECT 1 FROM flight_logs 
  WHERE flight_logs.id = flight_log_personnel.flight_log_id 
  AND flight_logs.company_id = get_user_company_id(auth.uid())
));

CREATE POLICY "Approved users can create flight log personnel"
ON flight_log_personnel FOR INSERT
WITH CHECK (EXISTS (
  SELECT 1 FROM flight_logs 
  WHERE flight_logs.id = flight_log_personnel.flight_log_id 
  AND flight_logs.user_id = auth.uid()
));

CREATE POLICY "Users can delete own flight log personnel"
ON flight_log_personnel FOR DELETE
USING (EXISTS (
  SELECT 1 FROM flight_logs 
  WHERE flight_logs.id = flight_log_personnel.flight_log_id 
  AND flight_logs.user_id = auth.uid()
));