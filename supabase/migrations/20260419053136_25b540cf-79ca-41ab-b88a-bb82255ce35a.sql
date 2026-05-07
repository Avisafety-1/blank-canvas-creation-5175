ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS deviation_report_enabled boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS public.deviation_report_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  parent_id uuid NULL REFERENCES public.deviation_report_categories(id) ON DELETE CASCADE,
  label text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_deviation_categories_company_parent
  ON public.deviation_report_categories(company_id, parent_id, sort_order);

ALTER TABLE public.deviation_report_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View deviation categories in visible companies"
  ON public.deviation_report_categories FOR SELECT
  USING (company_id = ANY(public.get_user_visible_company_ids(auth.uid())));

CREATE POLICY "Admins manage deviation categories"
  ON public.deviation_report_categories FOR ALL
  USING (
    company_id = ANY(public.get_user_visible_company_ids(auth.uid()))
    AND (public.has_role(auth.uid(), 'administrator') OR public.has_role(auth.uid(), 'superadmin'))
  )
  WITH CHECK (
    company_id = ANY(public.get_user_visible_company_ids(auth.uid()))
    AND (public.has_role(auth.uid(), 'administrator') OR public.has_role(auth.uid(), 'superadmin'))
  );

CREATE TABLE IF NOT EXISTS public.mission_deviation_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mission_id uuid NOT NULL REFERENCES public.missions(id) ON DELETE CASCADE,
  flight_log_id uuid NULL,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  reported_by uuid NULL REFERENCES public.profiles(id) ON DELETE SET NULL,
  category_path text[] NOT NULL DEFAULT '{}',
  category_ids uuid[] NOT NULL DEFAULT '{}',
  comment text NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mission_deviation_reports_mission
  ON public.mission_deviation_reports(mission_id);
CREATE INDEX IF NOT EXISTS idx_mission_deviation_reports_company
  ON public.mission_deviation_reports(company_id);

ALTER TABLE public.mission_deviation_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View deviation reports in visible companies"
  ON public.mission_deviation_reports FOR SELECT
  USING (company_id = ANY(public.get_user_visible_company_ids(auth.uid())));

CREATE POLICY "Users insert own deviation reports"
  ON public.mission_deviation_reports FOR INSERT
  WITH CHECK (
    company_id = ANY(public.get_user_visible_company_ids(auth.uid()))
    AND (reported_by IS NULL OR reported_by = auth.uid())
  );

CREATE POLICY "Admins delete deviation reports"
  ON public.mission_deviation_reports FOR DELETE
  USING (
    company_id = ANY(public.get_user_visible_company_ids(auth.uid()))
    AND (public.has_role(auth.uid(), 'administrator') OR public.has_role(auth.uid(), 'superadmin'))
  );