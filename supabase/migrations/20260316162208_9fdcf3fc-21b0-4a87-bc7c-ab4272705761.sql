-- 1. Update RLS policy to allow reading parent company
DROP POLICY IF EXISTS "Users can view own company and children" ON public.companies;
DROP POLICY IF EXISTS "Users can view own company, parent and children" ON public.companies;

CREATE POLICY "Users can view own company, parent and children" ON public.companies
FOR SELECT TO authenticated
USING (
  id = get_user_company_id(auth.uid())
  OR parent_company_id = get_user_company_id(auth.uid())
  OR id = (
    SELECT c.parent_company_id FROM public.companies c
    WHERE c.id = get_user_company_id(auth.uid())
  )
);

-- 2. Sync existing child companies to inherit parent settings
UPDATE companies
SET stripe_exempt = parent.stripe_exempt,
    dji_flightlog_enabled = parent.dji_flightlog_enabled
FROM companies parent
WHERE companies.parent_company_id = parent.id
  AND companies.parent_company_id IS NOT NULL;