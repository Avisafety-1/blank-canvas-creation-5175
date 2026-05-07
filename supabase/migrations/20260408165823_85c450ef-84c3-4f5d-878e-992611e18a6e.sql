
CREATE TABLE public.company_mission_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE NOT NULL,
  name text NOT NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE(company_id, name)
);

ALTER TABLE public.company_mission_roles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view roles for visible companies"
ON public.company_mission_roles
FOR SELECT
TO authenticated
USING (company_id = ANY(public.get_user_visible_company_ids(auth.uid())));

CREATE POLICY "Users can insert roles for their own company"
ON public.company_mission_roles
FOR INSERT
TO authenticated
WITH CHECK (company_id = ANY(public.get_user_visible_company_ids(auth.uid())));

CREATE POLICY "Users can delete roles for their own company"
ON public.company_mission_roles
FOR DELETE
TO authenticated
USING (company_id = ANY(public.get_user_visible_company_ids(auth.uid())));

CREATE POLICY "Users can update roles for their own company"
ON public.company_mission_roles
FOR UPDATE
TO authenticated
USING (company_id = ANY(public.get_user_visible_company_ids(auth.uid())));

ALTER TABLE public.mission_personnel
  ADD COLUMN role_id uuid REFERENCES public.company_mission_roles(id) ON DELETE SET NULL;
