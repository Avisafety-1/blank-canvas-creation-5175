-- 1. Create SECURITY DEFINER helper to break recursion
CREATE OR REPLACE FUNCTION public.get_parent_company_id(_company_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT parent_company_id FROM public.companies WHERE id = _company_id
$$;

-- 2. Replace the recursive RLS policy
DROP POLICY IF EXISTS "Users can view own company, parent and children" ON public.companies;

CREATE POLICY "Users can view own company, parent and children" ON public.companies
FOR SELECT TO authenticated
USING (
  id = get_user_company_id(auth.uid())
  OR parent_company_id = get_user_company_id(auth.uid())
  OR id = get_parent_company_id(get_user_company_id(auth.uid()))
);