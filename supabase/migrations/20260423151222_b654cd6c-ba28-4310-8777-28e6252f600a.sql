-- Replace folder SELECT policy to also allow visibility when folder contains a shared-down course
DROP POLICY IF EXISTS "Users can view training folders for their company hierarchy" ON public.training_course_folders;

CREATE POLICY "Users can view training folders for their company hierarchy"
ON public.training_course_folders
FOR SELECT
USING (
  (company_id IN (SELECT unnest(get_user_visible_company_ids(auth.uid()))))
  OR (
    visible_to_children = true
    AND company_id IN (SELECT unnest(get_user_readable_company_ids(auth.uid())))
  )
  OR (
    company_id IN (SELECT unnest(get_user_readable_company_ids(auth.uid())))
    AND EXISTS (
      SELECT 1 FROM public.training_courses tc
      WHERE tc.folder_id = training_course_folders.id
        AND tc.visible_to_children = true
    )
  )
);