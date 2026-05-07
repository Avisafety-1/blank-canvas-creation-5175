
-- Migration 2: Migrate existing users and update has_role() function

-- Migrate existing users to new roles
UPDATE public.user_roles SET role = 'bruker'
  WHERE role IN ('lesetilgang', 'operatør', 'saksbehandler');

UPDATE public.user_roles SET role = 'administrator'
  WHERE role = 'admin';

-- Update has_role() function with new hierarchy + legacy aliases for backward compatibility
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE _role
    WHEN 'superadmin'     THEN EXISTS (SELECT 1 FROM user_roles WHERE user_id = _user_id AND role = 'superadmin')
    WHEN 'administrator'  THEN EXISTS (SELECT 1 FROM user_roles WHERE user_id = _user_id AND role IN ('superadmin', 'administrator'))
    -- Legacy 'admin' alias: same as 'administrator' for backward compatibility with existing RLS policies
    WHEN 'admin'          THEN EXISTS (SELECT 1 FROM user_roles WHERE user_id = _user_id AND role IN ('superadmin', 'administrator'))
    WHEN 'bruker'         THEN EXISTS (SELECT 1 FROM user_roles WHERE user_id = _user_id AND role IN ('superadmin', 'administrator', 'bruker'))
    -- Legacy aliases map to bruker
    WHEN 'saksbehandler'  THEN EXISTS (SELECT 1 FROM user_roles WHERE user_id = _user_id AND role IN ('superadmin', 'administrator', 'bruker'))
    WHEN 'operatør'       THEN EXISTS (SELECT 1 FROM user_roles WHERE user_id = _user_id AND role IN ('superadmin', 'administrator', 'bruker'))
    WHEN 'lesetilgang'    THEN EXISTS (SELECT 1 FROM user_roles WHERE user_id = _user_id AND role IN ('superadmin', 'administrator', 'bruker'))
    ELSE false
  END
$$;
