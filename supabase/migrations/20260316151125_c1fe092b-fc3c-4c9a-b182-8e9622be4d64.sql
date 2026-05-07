CREATE OR REPLACE FUNCTION get_user_accessible_companies(_user_id uuid)
RETURNS TABLE(company_id uuid, company_name text, is_parent boolean)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT sub.cid, sub.cname, sub.cparent FROM (
    SELECT c.id AS cid, c.navn::text AS cname, EXISTS(
      SELECT 1 FROM companies child WHERE child.parent_company_id = c.id
    ) AS cparent
    FROM user_companies uc
    JOIN companies c ON c.id = uc.company_id
    WHERE uc.user_id = _user_id

    UNION

    SELECT child.id AS cid, child.navn::text AS cname, false AS cparent
    FROM user_companies uc
    JOIN companies child ON child.parent_company_id = uc.company_id
    WHERE uc.user_id = _user_id
      AND EXISTS (
        SELECT 1 FROM user_roles ur WHERE ur.user_id = _user_id AND ur.role IN ('administrator', 'admin', 'superadmin')
      )
  ) sub
  ORDER BY sub.cname
$$;