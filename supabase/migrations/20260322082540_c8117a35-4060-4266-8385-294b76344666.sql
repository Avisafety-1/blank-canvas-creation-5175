CREATE OR REPLACE FUNCTION get_user_visible_company_ids(_user_id uuid)
RETURNS uuid[] LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE 
    WHEN EXISTS (
      SELECT 1 FROM user_roles 
      WHERE user_id = _user_id 
      AND role IN ('administrator', 'admin', 'superadmin')
    ) THEN
      ARRAY(
        SELECT DISTINCT id FROM (
          SELECT id FROM companies WHERE id = (SELECT company_id FROM profiles WHERE id = _user_id)
          UNION
          SELECT id FROM companies WHERE parent_company_id = (SELECT company_id FROM profiles WHERE id = _user_id)
          UNION
          SELECT parent_company_id FROM companies WHERE id = (SELECT company_id FROM profiles WHERE id = _user_id) AND parent_company_id IS NOT NULL
        ) sub
      )
    ELSE
      ARRAY(
        SELECT DISTINCT id FROM (
          SELECT company_id AS id FROM profiles WHERE id = _user_id
          UNION
          SELECT parent_company_id AS id FROM companies WHERE id = (SELECT company_id FROM profiles WHERE id = _user_id) AND parent_company_id IS NOT NULL
        ) sub
      )
  END
$$;