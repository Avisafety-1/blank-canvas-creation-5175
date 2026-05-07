-- Allow users to view their own company data (needed for before_takeoff_checklist_ids visibility)
CREATE POLICY "Users can view own company" 
ON public.companies
FOR SELECT
USING (id = get_user_company_id(auth.uid()));