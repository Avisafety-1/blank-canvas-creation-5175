DROP POLICY IF EXISTS "Users can update missions in own company" ON missions;
CREATE POLICY "Users can update missions in own company" ON missions 
FOR UPDATE USING (
  company_id = ANY(get_user_visible_company_ids(auth.uid()))
);