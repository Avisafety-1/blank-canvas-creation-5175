-- New function: includes parent company (for shared config like SORA)
CREATE OR REPLACE FUNCTION get_user_readable_company_ids(_user_id uuid)
RETURNS uuid[]
LANGUAGE sql
STABLE
SECURITY DEFINER
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

-- Restore get_user_visible_company_ids WITHOUT parent (resource isolation)
CREATE OR REPLACE FUNCTION get_user_visible_company_ids(_user_id uuid)
RETURNS uuid[]
LANGUAGE sql
STABLE
SECURITY DEFINER
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
        ) sub
      )
    ELSE
      ARRAY[
        (SELECT company_id FROM profiles WHERE id = _user_id)
      ]
  END
$$;

-- Update SORA config RLS to use readable function
DROP POLICY IF EXISTS "Users can read own company config" ON company_sora_config;
DROP POLICY IF EXISTS "Users can read own and parent company config" ON company_sora_config;
CREATE POLICY "Users can read own and parent company config"
  ON company_sora_config FOR SELECT TO authenticated
  USING (company_id = ANY(get_user_readable_company_ids(auth.uid())));
