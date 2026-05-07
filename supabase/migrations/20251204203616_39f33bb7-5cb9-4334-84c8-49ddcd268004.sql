-- Tabell for inspeksjonshistorikk
CREATE TABLE public.drone_inspections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  drone_id UUID NOT NULL REFERENCES public.drones(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES public.companies(id),
  user_id UUID NOT NULL,
  inspection_date TIMESTAMPTZ NOT NULL,
  inspection_type TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Tabell for utstyrsendringer
CREATE TABLE public.drone_equipment_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  drone_id UUID NOT NULL REFERENCES public.drones(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES public.companies(id),
  user_id UUID NOT NULL,
  action TEXT NOT NULL,
  item_type TEXT NOT NULL,
  item_id UUID,
  item_name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Tabell for manuelle logginnlegg
CREATE TABLE public.drone_log_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  drone_id UUID NOT NULL REFERENCES public.drones(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES public.companies(id),
  user_id UUID NOT NULL,
  entry_date TIMESTAMPTZ NOT NULL,
  entry_type TEXT,
  title TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.drone_inspections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.drone_equipment_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.drone_log_entries ENABLE ROW LEVEL SECURITY;

-- RLS for drone_inspections
CREATE POLICY "Users can view inspections from own company"
ON public.drone_inspections FOR SELECT
USING (company_id = get_user_company_id(auth.uid()));

CREATE POLICY "Approved users can create inspections in own company"
ON public.drone_inspections FOR INSERT
WITH CHECK (
  company_id = get_user_company_id(auth.uid()) AND
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND approved = true)
);

CREATE POLICY "Users can delete own inspections"
ON public.drone_inspections FOR DELETE
USING (user_id = auth.uid() AND company_id = get_user_company_id(auth.uid()));

-- RLS for drone_equipment_history
CREATE POLICY "Users can view equipment history from own company"
ON public.drone_equipment_history FOR SELECT
USING (company_id = get_user_company_id(auth.uid()));

CREATE POLICY "Approved users can create equipment history in own company"
ON public.drone_equipment_history FOR INSERT
WITH CHECK (
  company_id = get_user_company_id(auth.uid()) AND
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND approved = true)
);

-- RLS for drone_log_entries
CREATE POLICY "Users can view log entries from own company"
ON public.drone_log_entries FOR SELECT
USING (company_id = get_user_company_id(auth.uid()));

CREATE POLICY "Approved users can create log entries in own company"
ON public.drone_log_entries FOR INSERT
WITH CHECK (
  company_id = get_user_company_id(auth.uid()) AND
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND approved = true)
);

CREATE POLICY "Users can delete own log entries"
ON public.drone_log_entries FOR DELETE
USING (user_id = auth.uid() AND company_id = get_user_company_id(auth.uid()));

CREATE POLICY "Admins can delete log entries in own company"
ON public.drone_log_entries FOR DELETE
USING (has_role(auth.uid(), 'admin'::app_role) AND company_id = get_user_company_id(auth.uid()));