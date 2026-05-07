-- Create equipment_log_entries table
CREATE TABLE public.equipment_log_entries (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  equipment_id UUID NOT NULL REFERENCES public.equipment(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES public.companies(id),
  user_id UUID NOT NULL,
  entry_date TIMESTAMP WITH TIME ZONE NOT NULL,
  entry_type TEXT,
  title TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.equipment_log_entries ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Users can view equipment log entries from own company"
  ON public.equipment_log_entries FOR SELECT
  USING (company_id = get_user_company_id(auth.uid()));

CREATE POLICY "Approved users can create equipment log entries in own company"
  ON public.equipment_log_entries FOR INSERT
  WITH CHECK (
    company_id = get_user_company_id(auth.uid()) AND
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND approved = true)
  );

CREATE POLICY "Users can delete own equipment log entries"
  ON public.equipment_log_entries FOR DELETE
  USING (user_id = auth.uid() AND company_id = get_user_company_id(auth.uid()));

CREATE POLICY "Admins can delete equipment log entries in own company"
  ON public.equipment_log_entries FOR DELETE
  USING (has_role(auth.uid(), 'admin'::app_role) AND company_id = get_user_company_id(auth.uid()));