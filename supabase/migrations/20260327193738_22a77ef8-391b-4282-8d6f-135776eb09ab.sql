-- Training course folders
CREATE TABLE public.training_course_folders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id),
  visible_to_children boolean NOT NULL DEFAULT false
);

ALTER TABLE public.training_course_folders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view training folders for their company hierarchy"
  ON public.training_course_folders FOR SELECT TO authenticated
  USING (
    company_id IN (SELECT unnest(public.get_user_visible_company_ids(auth.uid())))
    OR (
      visible_to_children = true
      AND company_id IN (SELECT unnest(public.get_user_readable_company_ids(auth.uid())))
    )
  );

CREATE POLICY "Admins can insert training folders"
  ON public.training_course_folders FOR INSERT TO authenticated
  WITH CHECK (
    company_id IN (SELECT unnest(public.get_user_visible_company_ids(auth.uid())))
    AND public.has_role(auth.uid(), 'admin')
  );

CREATE POLICY "Admins can update training folders"
  ON public.training_course_folders FOR UPDATE TO authenticated
  USING (
    company_id IN (SELECT unnest(public.get_user_visible_company_ids(auth.uid())))
    AND public.has_role(auth.uid(), 'admin')
  );

CREATE POLICY "Admins can delete training folders"
  ON public.training_course_folders FOR DELETE TO authenticated
  USING (
    company_id IN (SELECT unnest(public.get_user_visible_company_ids(auth.uid())))
    AND public.has_role(auth.uid(), 'admin')
  );

-- Add folder_id and global_visibility to training_courses
ALTER TABLE public.training_courses 
  ADD COLUMN folder_id uuid REFERENCES public.training_course_folders(id) ON DELETE SET NULL,
  ADD COLUMN global_visibility boolean NOT NULL DEFAULT false;

-- Update SELECT policy on training_courses to include globally visible courses
DROP POLICY IF EXISTS "Users can view training courses for their company hierarchy" ON public.training_courses;
CREATE POLICY "Users can view training courses for their company hierarchy"
  ON public.training_courses FOR SELECT TO authenticated
  USING (
    company_id IN (SELECT unnest(public.get_user_visible_company_ids(auth.uid())))
    OR global_visibility = true
  );