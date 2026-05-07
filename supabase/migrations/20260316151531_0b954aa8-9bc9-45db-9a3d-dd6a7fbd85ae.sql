CREATE OR REPLACE FUNCTION can_user_access_company(_user_id uuid, _company_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM user_companies
    WHERE user_id = _user_id AND company_id = _company_id
  )
  OR EXISTS (
    -- Admin can access child companies of their own companies
    SELECT 1 FROM user_companies uc
    JOIN companies child ON child.parent_company_id = uc.company_id
    WHERE uc.user_id = _user_id
      AND child.id = _company_id
      AND EXISTS (
        SELECT 1 FROM user_roles ur WHERE ur.user_id = _user_id AND ur.role IN ('administrator', 'admin', 'superadmin')
      )
  )
  OR public.has_role(_user_id, 'superadmin'::app_role)
$$;