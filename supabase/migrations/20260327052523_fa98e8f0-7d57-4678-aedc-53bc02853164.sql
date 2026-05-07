DROP POLICY IF EXISTS "Users can view customers from own company" ON customers;
CREATE POLICY "Users can view customers from own company" ON customers
  FOR SELECT USING (
    company_id = ANY(get_user_readable_company_ids(auth.uid()))
  );