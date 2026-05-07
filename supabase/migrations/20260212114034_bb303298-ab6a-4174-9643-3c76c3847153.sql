
-- =============================================
-- Migrasjon 2: personnel_competencies
-- Legger til selskapsfilter via profiles-tabellen
-- =============================================

-- Dropp usikre policyer
DROP POLICY IF EXISTS "All authenticated users can view personnel competencies" ON personnel_competencies;
DROP POLICY IF EXISTS "Admins can delete all competencies" ON personnel_competencies;
DROP POLICY IF EXISTS "Admins and saksbehandler can create all competencies" ON personnel_competencies;
DROP POLICY IF EXISTS "Admins and saksbehandler can update all competencies" ON personnel_competencies;

-- Ny SELECT: Brukere kan se kompetanser for ansatte i eget selskap
CREATE POLICY "Users can view competencies in own company"
ON personnel_competencies FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = personnel_competencies.profile_id
    AND profiles.company_id = get_user_company_id(auth.uid())
  )
);

-- Ny admin/saksbehandler INSERT med selskapsfilter
CREATE POLICY "Admins can create competencies in own company"
ON personnel_competencies FOR INSERT TO authenticated
WITH CHECK (
  (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'saksbehandler'))
  AND EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = personnel_competencies.profile_id
    AND profiles.company_id = get_user_company_id(auth.uid())
  )
);

-- Ny admin/saksbehandler UPDATE med selskapsfilter
CREATE POLICY "Admins can update competencies in own company"
ON personnel_competencies FOR UPDATE TO authenticated
USING (
  (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'saksbehandler'))
  AND EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = personnel_competencies.profile_id
    AND profiles.company_id = get_user_company_id(auth.uid())
  )
);

-- Ny admin DELETE med selskapsfilter
CREATE POLICY "Admins can delete competencies in own company"
ON personnel_competencies FOR DELETE TO authenticated
USING (
  has_role(auth.uid(), 'admin')
  AND EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = personnel_competencies.profile_id
    AND profiles.company_id = get_user_company_id(auth.uid())
  )
);
