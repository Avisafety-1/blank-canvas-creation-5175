-- Create drone_accessories table for optional equipment with maintenance intervals
CREATE TABLE public.drone_accessories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  drone_id uuid NOT NULL REFERENCES public.drones(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id),
  user_id uuid NOT NULL,
  navn text NOT NULL,
  vedlikeholdsintervall_dager integer,
  sist_vedlikehold timestamp with time zone,
  neste_vedlikehold timestamp with time zone,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.drone_accessories ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view accessories for drones in their company"
ON public.drone_accessories FOR SELECT
USING (company_id = get_user_company_id(auth.uid()));

CREATE POLICY "Approved users can create accessories for drones in their company"
ON public.drone_accessories FOR INSERT
WITH CHECK (
  company_id = get_user_company_id(auth.uid())
  AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND approved = true)
);

CREATE POLICY "Users can update accessories in their company"
ON public.drone_accessories FOR UPDATE
USING (company_id = get_user_company_id(auth.uid()));

CREATE POLICY "Users can delete accessories in their company"
ON public.drone_accessories FOR DELETE
USING (company_id = get_user_company_id(auth.uid()));

-- Add to realtime publication
ALTER PUBLICATION supabase_realtime ADD TABLE public.drone_accessories;

-- Set replica identity for realtime
ALTER TABLE public.drone_accessories REPLICA IDENTITY FULL;