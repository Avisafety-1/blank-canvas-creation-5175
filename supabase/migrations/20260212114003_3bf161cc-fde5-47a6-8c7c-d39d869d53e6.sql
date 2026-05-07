
-- =============================================
-- Migrasjon 1: mission_drones, mission_equipment, mission_personnel
-- Legger til selskapsfilter via missions-tabellen
-- =============================================

-- mission_drones: Dropp usikre policyer
DROP POLICY IF EXISTS "All authenticated users can view mission drones" ON mission_drones;
DROP POLICY IF EXISTS "Admins can manage all mission drones" ON mission_drones;

-- mission_drones: Ny SELECT med selskapsfilter
CREATE POLICY "Users can view mission_drones in own company"
ON mission_drones FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM missions
    WHERE missions.id = mission_drones.mission_id
    AND missions.company_id = get_user_company_id(auth.uid())
  )
);

-- mission_drones: Ny admin ALL med selskapsfilter
CREATE POLICY "Admins can manage mission_drones in own company"
ON mission_drones FOR ALL TO authenticated
USING (
  has_role(auth.uid(), 'admin') AND
  EXISTS (
    SELECT 1 FROM missions
    WHERE missions.id = mission_drones.mission_id
    AND missions.company_id = get_user_company_id(auth.uid())
  )
)
WITH CHECK (
  has_role(auth.uid(), 'admin') AND
  EXISTS (
    SELECT 1 FROM missions
    WHERE missions.id = mission_drones.mission_id
    AND missions.company_id = get_user_company_id(auth.uid())
  )
);

-- mission_equipment: Dropp usikre policyer
DROP POLICY IF EXISTS "All authenticated users can view mission equipment" ON mission_equipment;
DROP POLICY IF EXISTS "Admins can manage all mission equipment" ON mission_equipment;

-- mission_equipment: Ny SELECT med selskapsfilter
CREATE POLICY "Users can view mission_equipment in own company"
ON mission_equipment FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM missions
    WHERE missions.id = mission_equipment.mission_id
    AND missions.company_id = get_user_company_id(auth.uid())
  )
);

-- mission_equipment: Ny admin ALL med selskapsfilter
CREATE POLICY "Admins can manage mission_equipment in own company"
ON mission_equipment FOR ALL TO authenticated
USING (
  has_role(auth.uid(), 'admin') AND
  EXISTS (
    SELECT 1 FROM missions
    WHERE missions.id = mission_equipment.mission_id
    AND missions.company_id = get_user_company_id(auth.uid())
  )
)
WITH CHECK (
  has_role(auth.uid(), 'admin') AND
  EXISTS (
    SELECT 1 FROM missions
    WHERE missions.id = mission_equipment.mission_id
    AND missions.company_id = get_user_company_id(auth.uid())
  )
);

-- mission_personnel: Dropp usikre policyer
DROP POLICY IF EXISTS "All authenticated users can view mission personnel" ON mission_personnel;
DROP POLICY IF EXISTS "Admins can manage all mission personnel" ON mission_personnel;

-- mission_personnel: Ny SELECT med selskapsfilter
CREATE POLICY "Users can view mission_personnel in own company"
ON mission_personnel FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM missions
    WHERE missions.id = mission_personnel.mission_id
    AND missions.company_id = get_user_company_id(auth.uid())
  )
);

-- mission_personnel: Ny admin ALL med selskapsfilter
CREATE POLICY "Admins can manage mission_personnel in own company"
ON mission_personnel FOR ALL TO authenticated
USING (
  has_role(auth.uid(), 'admin') AND
  EXISTS (
    SELECT 1 FROM missions
    WHERE missions.id = mission_personnel.mission_id
    AND missions.company_id = get_user_company_id(auth.uid())
  )
)
WITH CHECK (
  has_role(auth.uid(), 'admin') AND
  EXISTS (
    SELECT 1 FROM missions
    WHERE missions.id = mission_personnel.mission_id
    AND missions.company_id = get_user_company_id(auth.uid())
  )
);
