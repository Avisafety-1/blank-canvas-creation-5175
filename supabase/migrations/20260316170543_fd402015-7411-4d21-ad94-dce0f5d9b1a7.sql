
-- Drop existing restrictive policies on user_roles
DROP POLICY IF EXISTS "Admins can insert roles for own company" ON public.user_roles;
DROP POLICY IF EXISTS "Admins can update roles for own company" ON public.user_roles;
DROP POLICY IF EXISTS "Admins can delete roles for own company" ON public.user_roles;
DROP POLICY IF EXISTS "Admins can insert non-superadmin roles in own company" ON public.user_roles;
DROP POLICY IF EXISTS "Admins can update non-superadmin roles in own company" ON public.user_roles;
DROP POLICY IF EXISTS "Admins can delete non-superadmin roles in own company" ON public.user_roles;

-- New policies scoped to visible companies (own + child), excluding superadmin
CREATE POLICY "Admins can insert non-superadmin roles in visible companies"
ON public.user_roles FOR INSERT TO authenticated
WITH CHECK (
  public.has_role(auth.uid(), 'administrator'::public.app_role)
  AND role <> 'superadmin'::public.app_role
  AND EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = user_roles.user_id
    AND p.company_id = ANY(public.get_user_visible_company_ids(auth.uid()))
  )
);

CREATE POLICY "Admins can update non-superadmin roles in visible companies"
ON public.user_roles FOR UPDATE TO authenticated
USING (
  public.has_role(auth.uid(), 'administrator'::public.app_role)
  AND EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = user_roles.user_id
    AND p.company_id = ANY(public.get_user_visible_company_ids(auth.uid()))
  )
)
WITH CHECK (
  public.has_role(auth.uid(), 'administrator'::public.app_role)
  AND role <> 'superadmin'::public.app_role
  AND EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = user_roles.user_id
    AND p.company_id = ANY(public.get_user_visible_company_ids(auth.uid()))
  )
);

CREATE POLICY "Admins can delete non-superadmin roles in visible companies"
ON public.user_roles FOR DELETE TO authenticated
USING (
  public.has_role(auth.uid(), 'administrator'::public.app_role)
  AND role <> 'superadmin'::public.app_role
  AND EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = user_roles.user_id
    AND p.company_id = ANY(public.get_user_visible_company_ids(auth.uid()))
  )
);
