-- 1. INSERT policy
DROP POLICY IF EXISTS "Admins can create competencies in own company" ON public.personnel_competencies;
CREATE POLICY "Admins can create competencies in visible companies"
  ON public.personnel_competencies FOR INSERT TO authenticated
  WITH CHECK (
    (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'saksbehandler'::app_role))
    AND EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = personnel_competencies.profile_id
        AND profiles.company_id = ANY(get_user_visible_company_ids(auth.uid()))
    )
  );

-- 2. UPDATE policy
DROP POLICY IF EXISTS "Admins can update competencies in own company" ON public.personnel_competencies;
CREATE POLICY "Admins can update competencies in visible companies"
  ON public.personnel_competencies FOR UPDATE TO authenticated
  USING (
    (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'saksbehandler'::app_role))
    AND EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = personnel_competencies.profile_id
        AND profiles.company_id = ANY(get_user_visible_company_ids(auth.uid()))
    )
  );

-- 3. DELETE policy
DROP POLICY IF EXISTS "Admins can delete competencies in own company" ON public.personnel_competencies;
CREATE POLICY "Admins can delete competencies in visible companies"
  ON public.personnel_competencies FOR DELETE TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    AND EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = personnel_competencies.profile_id
        AND profiles.company_id = ANY(get_user_visible_company_ids(auth.uid()))
    )
  );