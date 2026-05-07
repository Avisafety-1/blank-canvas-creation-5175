-- Admin UPDATE policy: expand to visible companies
DROP POLICY IF EXISTS "Admins can update incidents in own company" ON incidents;
CREATE POLICY "Admins can update incidents in own company" ON incidents
FOR UPDATE USING (
  (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'saksbehandler'))
  AND company_id = ANY(get_user_visible_company_ids(auth.uid()))
);

-- Superadmin UPDATE policy: expand to visible companies
DROP POLICY IF EXISTS "Superadmins can update all incidents" ON incidents;
CREATE POLICY "Superadmins can update all incidents" ON incidents
FOR UPDATE USING (
  is_superadmin(auth.uid())
  AND company_id = ANY(get_user_visible_company_ids(auth.uid()))
);