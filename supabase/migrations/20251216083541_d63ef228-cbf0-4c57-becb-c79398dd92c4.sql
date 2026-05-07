-- Add new columns to dronetag_devices
ALTER TABLE dronetag_devices ADD COLUMN IF NOT EXISTS kjopsdato timestamp with time zone;
ALTER TABLE dronetag_devices ADD COLUMN IF NOT EXISTS user_id uuid;

-- Update existing SELECT policy to use company function
DROP POLICY IF EXISTS "dronetag_devices_select_company" ON dronetag_devices;

CREATE POLICY "Users can view dronetag devices from own company"
  ON dronetag_devices FOR SELECT
  USING (company_id = get_user_company_id(auth.uid()));

-- RLS policies for CRUD operations
CREATE POLICY "Approved users can create dronetag devices in own company"
  ON dronetag_devices FOR INSERT
  WITH CHECK (
    company_id = get_user_company_id(auth.uid()) 
    AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND approved = true)
  );

CREATE POLICY "Users can update dronetag devices in own company"
  ON dronetag_devices FOR UPDATE
  USING (company_id = get_user_company_id(auth.uid()));

CREATE POLICY "Admins can delete dronetag devices in own company"
  ON dronetag_devices FOR DELETE
  USING (has_role(auth.uid(), 'admin'::app_role) AND company_id = get_user_company_id(auth.uid()));