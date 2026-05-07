-- Tighten user_roles RLS: only superadmins may assign 'superadmin'

-- Replace overly-permissive admin policies
DROP POLICY IF EXISTS "Admins can insert roles" ON public.user_roles;
DROP POLICY IF EXISTS "Admins can update roles" ON public.user_roles;
DROP POLICY IF EXISTS "Admins can delete roles" ON public.user_roles;

-- Superadmins can fully manage roles
DROP POLICY IF EXISTS "Superadmins can manage roles" ON public.user_roles;
CREATE POLICY "Superadmins can manage roles"
ON public.user_roles
FOR ALL
USING (has_role(auth.uid(), 'superadmin'::public.app_role))
WITH CHECK (has_role(auth.uid(), 'superadmin'::public.app_role));

-- Admins can manage roles, except they cannot create/update/delete superadmin rows
CREATE POLICY "Admins can insert non-superadmin roles"
ON public.user_roles
FOR INSERT
WITH CHECK (
  has_role(auth.uid(), 'admin'::public.app_role)
  AND role <> 'superadmin'::public.app_role
);

CREATE POLICY "Admins can update non-superadmin roles"
ON public.user_roles
FOR UPDATE
USING (
  has_role(auth.uid(), 'admin'::public.app_role)
  AND role <> 'superadmin'::public.app_role
)
WITH CHECK (
  has_role(auth.uid(), 'admin'::public.app_role)
  AND role <> 'superadmin'::public.app_role
);

CREATE POLICY "Admins can delete non-superadmin roles"
ON public.user_roles
FOR DELETE
USING (
  has_role(auth.uid(), 'admin'::public.app_role)
  AND role <> 'superadmin'::public.app_role
);
