
CREATE TABLE public.company_flight_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE NOT NULL,
  alert_type text NOT NULL,
  enabled boolean DEFAULT true,
  threshold_value numeric,
  created_at timestamptz DEFAULT now(),
  UNIQUE(company_id, alert_type)
);

ALTER TABLE public.company_flight_alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view flight alerts for visible companies"
  ON public.company_flight_alerts FOR SELECT TO authenticated
  USING (company_id = ANY(public.get_user_visible_company_ids(auth.uid())));

CREATE POLICY "Users can insert flight alerts for visible companies"
  ON public.company_flight_alerts FOR INSERT TO authenticated
  WITH CHECK (company_id = ANY(public.get_user_visible_company_ids(auth.uid())));

CREATE POLICY "Users can update flight alerts for visible companies"
  ON public.company_flight_alerts FOR UPDATE TO authenticated
  USING (company_id = ANY(public.get_user_visible_company_ids(auth.uid())));

CREATE POLICY "Users can delete flight alerts for visible companies"
  ON public.company_flight_alerts FOR DELETE TO authenticated
  USING (company_id = ANY(public.get_user_visible_company_ids(auth.uid())));

CREATE TABLE public.company_flight_alert_recipients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE NOT NULL,
  profile_id uuid NOT NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE(company_id, profile_id)
);

ALTER TABLE public.company_flight_alert_recipients ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view alert recipients for visible companies"
  ON public.company_flight_alert_recipients FOR SELECT TO authenticated
  USING (company_id = ANY(public.get_user_visible_company_ids(auth.uid())));

CREATE POLICY "Users can insert alert recipients for visible companies"
  ON public.company_flight_alert_recipients FOR INSERT TO authenticated
  WITH CHECK (company_id = ANY(public.get_user_visible_company_ids(auth.uid())));

CREATE POLICY "Users can delete alert recipients for visible companies"
  ON public.company_flight_alert_recipients FOR DELETE TO authenticated
  USING (company_id = ANY(public.get_user_visible_company_ids(auth.uid())));
