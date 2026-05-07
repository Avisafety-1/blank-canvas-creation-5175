
-- =============================================
-- Migrasjon 3: user_roles
-- Legger til selskapsfilter via profiles-tabellen
-- =============================================

-- Dropp usikre admin-policyer
DROP POLICY IF EXISTS "Admins can view all roles" ON user_roles;
DROP POLICY IF EXISTS "Admins can insert non-superadmin roles" ON user_roles;
DROP POLICY IF EXISTS "Admins can update non-superadmin roles" ON user_roles;
DROP POLICY IF EXISTS "Admins can delete non-superadmin roles" ON user_roles;

-- Ny admin SELECT med selskapsfilter
CREATE POLICY "Admins can view roles in own company"
ON user_roles FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'admin')
  AND EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = user_roles.user_id
    AND profiles.company_id = get_user_company_id(auth.uid())
  )
);

-- Ny admin INSERT med selskapsfilter (kan ikke sette superadmin)
CREATE POLICY "Admins can insert non-superadmin roles in own company"
ON user_roles FOR INSERT TO authenticated
WITH CHECK (
  has_role(auth.uid(), 'admin')
  AND role <> 'superadmin'
  AND EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = user_roles.user_id
    AND profiles.company_id = get_user_company_id(auth.uid())
  )
);

-- Ny admin UPDATE med selskapsfilter (kan ikke sette superadmin)
CREATE POLICY "Admins can update non-superadmin roles in own company"
ON user_roles FOR UPDATE TO authenticated
USING (
  has_role(auth.uid(), 'admin')
  AND role <> 'superadmin'
  AND EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = user_roles.user_id
    AND profiles.company_id = get_user_company_id(auth.uid())
  )
)
WITH CHECK (
  has_role(auth.uid(), 'admin')
  AND role <> 'superadmin'
  AND EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = user_roles.user_id
    AND profiles.company_id = get_user_company_id(auth.uid())
  )
);

-- Ny admin DELETE med selskapsfilter (kan ikke slette superadmin)
CREATE POLICY "Admins can delete non-superadmin roles in own company"
ON user_roles FOR DELETE TO authenticated
USING (
  has_role(auth.uid(), 'admin')
  AND role <> 'superadmin'
  AND EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = user_roles.user_id
    AND profiles.company_id = get_user_company_id(auth.uid())
  )
);
