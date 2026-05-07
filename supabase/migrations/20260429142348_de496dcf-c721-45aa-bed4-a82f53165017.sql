ALTER TABLE public.companies
ADD COLUMN IF NOT EXISTS incident_reports_visible_to_all_companies boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.get_effective_parent_company_id(_company_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(c.parent_company_id, c.id)
  FROM public.companies c
  WHERE c.id = _company_id
$$;

CREATE OR REPLACE FUNCTION public.get_user_incident_visible_company_ids(_user_id uuid)
RETURNS uuid[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH user_company AS (
    SELECT p.company_id
    FROM public.profiles p
    WHERE p.id = _user_id
  ),
  root_company AS (
    SELECT COALESCE(c.parent_company_id, c.id) AS id
    FROM public.companies c
    JOIN user_company uc ON uc.company_id = c.id
  ),
  base_visible AS (
    SELECT unnest(public.get_user_visible_company_ids(_user_id)) AS id
  ),
  shared_visible AS (
    SELECT c.id
    FROM public.companies c
    JOIN root_company rc ON c.id = rc.id OR c.parent_company_id = rc.id
    JOIN public.companies parent ON parent.id = rc.id
    WHERE parent.incident_reports_visible_to_all_companies = true
  )
  SELECT COALESCE(array_agg(DISTINCT id), ARRAY[]::uuid[])
  FROM (
    SELECT id FROM base_visible
    UNION
    SELECT id FROM shared_visible
  ) visible
$$;

DROP POLICY IF EXISTS "Users can view incidents from own company" ON public.incidents;
CREATE POLICY "Users can view incidents from own company"
ON public.incidents
FOR SELECT
TO authenticated
USING (
  company_id = ANY(public.get_user_incident_visible_company_ids(auth.uid()))
  OR public.is_superadmin(auth.uid())
);

DROP POLICY IF EXISTS "Users can view comments from own company incidents" ON public.incident_comments;
CREATE POLICY "Users can view comments from own company incidents"
ON public.incident_comments
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.incidents i
    WHERE i.id = incident_comments.incident_id
      AND (
        i.company_id = ANY(public.get_user_incident_visible_company_ids(auth.uid()))
        OR public.is_superadmin(auth.uid())
      )
  )
);