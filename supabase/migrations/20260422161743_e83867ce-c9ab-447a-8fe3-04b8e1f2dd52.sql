-- Add sharing columns
ALTER TABLE public.training_courses
  ADD COLUMN IF NOT EXISTS visible_to_children boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS shared_with_parent boolean NOT NULL DEFAULT false;

-- Update SELECT policy on training_courses
DROP POLICY IF EXISTS "Users can view training courses for their company hierarchy" ON public.training_courses;
CREATE POLICY "Users can view training courses for their company hierarchy"
  ON public.training_courses FOR SELECT TO authenticated
  USING (
    company_id IN (SELECT unnest(get_user_visible_company_ids(auth.uid())))
    OR global_visibility = true
    OR (visible_to_children = true
        AND company_id IN (SELECT unnest(get_user_readable_company_ids(auth.uid()))))
    OR (shared_with_parent = true
        AND get_parent_company_id(company_id) IN (SELECT unnest(get_user_visible_company_ids(auth.uid()))))
  );