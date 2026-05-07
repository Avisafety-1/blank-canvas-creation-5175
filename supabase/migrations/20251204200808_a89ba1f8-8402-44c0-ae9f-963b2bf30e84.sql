-- Drop and recreate drones update policy with superadmin
DROP POLICY IF EXISTS "Admins can update drones in own company" ON drones;
CREATE POLICY "Admins can update drones in own company" ON drones
FOR UPDATE USING (
  (has_role(auth.uid(), 'admin'::app_role) 
   OR has_role(auth.uid(), 'saksbehandler'::app_role)
   OR is_superadmin(auth.uid()))
  AND company_id = get_user_company_id(auth.uid())
);

-- Drop and recreate equipment update policy with superadmin
DROP POLICY IF EXISTS "Admins can update equipment in own company" ON equipment;
CREATE POLICY "Admins can update equipment in own company" ON equipment
FOR UPDATE USING (
  (has_role(auth.uid(), 'admin'::app_role) 
   OR has_role(auth.uid(), 'saksbehandler'::app_role)
   OR is_superadmin(auth.uid()))
  AND company_id = get_user_company_id(auth.uid())
);