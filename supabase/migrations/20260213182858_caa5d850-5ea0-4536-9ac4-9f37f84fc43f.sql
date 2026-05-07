
-- Table for storing revenue calculator scenarios globally (superadmin only)
CREATE TABLE public.revenue_calculator_scenarios (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  scenarios jsonb NOT NULL DEFAULT '[]'::jsonb,
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id),
  UNIQUE(company_id)
);

-- Enable RLS
ALTER TABLE public.revenue_calculator_scenarios ENABLE ROW LEVEL SECURITY;

-- Only superadmins can access
CREATE POLICY "Superadmins can view all calculator scenarios"
  ON public.revenue_calculator_scenarios FOR SELECT
  USING (is_superadmin(auth.uid()));

CREATE POLICY "Superadmins can insert calculator scenarios"
  ON public.revenue_calculator_scenarios FOR INSERT
  WITH CHECK (is_superadmin(auth.uid()));

CREATE POLICY "Superadmins can update calculator scenarios"
  ON public.revenue_calculator_scenarios FOR UPDATE
  USING (is_superadmin(auth.uid()));

CREATE POLICY "Superadmins can delete calculator scenarios"
  ON public.revenue_calculator_scenarios FOR DELETE
  USING (is_superadmin(auth.uid()));
