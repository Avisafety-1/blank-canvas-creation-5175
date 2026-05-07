-- Create table for tracking active flights (for cross-device sync)
CREATE TABLE public.active_flights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  start_time TIMESTAMPTZ NOT NULL DEFAULT now(),
  drone_id UUID REFERENCES public.drones(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.active_flights ENABLE ROW LEVEL SECURITY;

-- Only one active flight per user
CREATE UNIQUE INDEX idx_active_flights_profile ON public.active_flights(profile_id);

-- RLS policies - users can only manage their own active flights
CREATE POLICY "Users can view their own active flights"
ON public.active_flights FOR SELECT
USING (auth.uid() = profile_id);

CREATE POLICY "Users can insert their own active flights"
ON public.active_flights FOR INSERT
WITH CHECK (auth.uid() = profile_id);

CREATE POLICY "Users can delete their own active flights"
ON public.active_flights FOR DELETE
USING (auth.uid() = profile_id);