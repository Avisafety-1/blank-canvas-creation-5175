CREATE POLICY "Admins can update profiles in own company"
ON public.profiles
FOR UPDATE
TO authenticated
USING (
  public.has_role(auth.uid(), 'administrator')
  AND company_id = ANY(public.get_user_visible_company_ids(auth.uid()))
)
WITH CHECK (
  public.has_role(auth.uid(), 'administrator')
  AND company_id = ANY(public.get_user_visible_company_ids(auth.uid()))
);