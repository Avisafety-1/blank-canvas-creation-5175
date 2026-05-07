CREATE POLICY "Admins can update own company"
ON public.companies
FOR UPDATE
TO authenticated
USING (id = get_user_company_id(auth.uid()) AND has_role(auth.uid(), 'administrator'::app_role))
WITH CHECK (id = get_user_company_id(auth.uid()) AND has_role(auth.uid(), 'administrator'::app_role));