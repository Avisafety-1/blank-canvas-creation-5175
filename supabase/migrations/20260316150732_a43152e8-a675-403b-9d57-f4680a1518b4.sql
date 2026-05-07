-- Allow users to also view child companies of their own company
DROP POLICY IF EXISTS "Users can view own company" ON companies;
CREATE POLICY "Users can view own company and children"
  ON companies FOR SELECT TO authenticated
  USING (
    id = get_user_company_id(auth.uid())
    OR parent_company_id = get_user_company_id(auth.uid())
  );

-- Allow admins to update child companies
CREATE POLICY "Admins can update child companies"
  ON companies FOR UPDATE TO authenticated
  USING (
    parent_company_id = get_user_company_id(auth.uid())
    AND public.has_role(auth.uid(), 'administrator')
  );

-- Allow admins to delete child companies
CREATE POLICY "Admins can delete child companies"
  ON companies FOR DELETE TO authenticated
  USING (
    parent_company_id = get_user_company_id(auth.uid())
    AND public.has_role(auth.uid(), 'administrator')
  );