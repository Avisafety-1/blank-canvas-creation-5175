-- Allow sibling departments to see a course that has been shared down,
-- when the course owner and the viewer share the same parent company.
-- This handles the case: course shared up to parent (shared_with_parent=true),
-- then parent enables visible_to_children=true to redistribute to all siblings.

DROP POLICY IF EXISTS "Users can view training courses for their company hierarchy" ON public.training_courses;

CREATE POLICY "Users can view training courses for their company hierarchy"
ON public.training_courses
FOR SELECT
USING (
  (company_id IN (SELECT unnest(get_user_visible_company_ids(auth.uid()))))
  OR (global_visibility = true)
  OR (
    visible_to_children = true
    AND company_id IN (SELECT unnest(get_user_readable_company_ids(auth.uid())))
  )
  OR (
    -- Course shared up to parent: parent and any sibling under that parent can see it
    shared_with_parent = true
    AND get_parent_company_id(company_id) IN (SELECT unnest(get_user_visible_company_ids(auth.uid())))
  )
  OR (
    -- Course shared down (visible_to_children=true) AND also shared up to parent:
    -- siblings of the owning child company can see it via the common parent
    visible_to_children = true
    AND shared_with_parent = true
    AND get_parent_company_id(company_id) IN (
      SELECT parent_company_id FROM companies
      WHERE id IN (SELECT unnest(get_user_visible_company_ids(auth.uid())))
        AND parent_company_id IS NOT NULL
    )
  )
);