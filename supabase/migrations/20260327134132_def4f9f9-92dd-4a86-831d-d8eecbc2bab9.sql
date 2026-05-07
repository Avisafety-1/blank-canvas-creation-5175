-- Training courses
CREATE TABLE public.training_courses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  status text NOT NULL DEFAULT 'draft',
  passing_score integer NOT NULL DEFAULT 80,
  validity_months integer,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.training_courses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view training courses for their company hierarchy"
  ON public.training_courses FOR SELECT TO authenticated
  USING (company_id IN (SELECT unnest(public.get_user_visible_company_ids(auth.uid()))));

CREATE POLICY "Admins can insert training courses"
  ON public.training_courses FOR INSERT TO authenticated
  WITH CHECK (company_id IN (SELECT unnest(public.get_user_visible_company_ids(auth.uid()))));

CREATE POLICY "Admins can update training courses"
  ON public.training_courses FOR UPDATE TO authenticated
  USING (company_id IN (SELECT unnest(public.get_user_visible_company_ids(auth.uid()))));

CREATE POLICY "Admins can delete training courses"
  ON public.training_courses FOR DELETE TO authenticated
  USING (company_id IN (SELECT unnest(public.get_user_visible_company_ids(auth.uid()))));

-- Training questions
CREATE TABLE public.training_questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id uuid NOT NULL REFERENCES public.training_courses(id) ON DELETE CASCADE,
  question_text text NOT NULL,
  image_url text,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.training_questions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view training questions"
  ON public.training_questions FOR SELECT TO authenticated
  USING (course_id IN (SELECT id FROM public.training_courses));

CREATE POLICY "Admins can insert training questions"
  ON public.training_questions FOR INSERT TO authenticated
  WITH CHECK (course_id IN (SELECT id FROM public.training_courses));

CREATE POLICY "Admins can update training questions"
  ON public.training_questions FOR UPDATE TO authenticated
  USING (course_id IN (SELECT id FROM public.training_courses));

CREATE POLICY "Admins can delete training questions"
  ON public.training_questions FOR DELETE TO authenticated
  USING (course_id IN (SELECT id FROM public.training_courses));

-- Training question options
CREATE TABLE public.training_question_options (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id uuid NOT NULL REFERENCES public.training_questions(id) ON DELETE CASCADE,
  option_text text NOT NULL,
  is_correct boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0
);

ALTER TABLE public.training_question_options ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view training question options"
  ON public.training_question_options FOR SELECT TO authenticated
  USING (question_id IN (SELECT id FROM public.training_questions));

CREATE POLICY "Admins can insert training question options"
  ON public.training_question_options FOR INSERT TO authenticated
  WITH CHECK (question_id IN (SELECT id FROM public.training_questions));

CREATE POLICY "Admins can update training question options"
  ON public.training_question_options FOR UPDATE TO authenticated
  USING (question_id IN (SELECT id FROM public.training_questions));

CREATE POLICY "Admins can delete training question options"
  ON public.training_question_options FOR DELETE TO authenticated
  USING (question_id IN (SELECT id FROM public.training_questions));

-- Training assignments
CREATE TABLE public.training_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id uuid NOT NULL REFERENCES public.training_courses(id) ON DELETE CASCADE,
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  assigned_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  score integer,
  passed boolean,
  competency_id uuid REFERENCES public.personnel_competencies(id) ON DELETE SET NULL,
  UNIQUE(course_id, profile_id)
);

ALTER TABLE public.training_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view training assignments for their company hierarchy"
  ON public.training_assignments FOR SELECT TO authenticated
  USING (company_id IN (SELECT unnest(public.get_user_visible_company_ids(auth.uid()))));

CREATE POLICY "Admins can insert training assignments"
  ON public.training_assignments FOR INSERT TO authenticated
  WITH CHECK (company_id IN (SELECT unnest(public.get_user_visible_company_ids(auth.uid()))));

CREATE POLICY "Users can update own training assignments"
  ON public.training_assignments FOR UPDATE TO authenticated
  USING (profile_id = auth.uid() OR company_id IN (SELECT unnest(public.get_user_visible_company_ids(auth.uid()))));

CREATE POLICY "Admins can delete training assignments"
  ON public.training_assignments FOR DELETE TO authenticated
  USING (company_id IN (SELECT unnest(public.get_user_visible_company_ids(auth.uid()))));