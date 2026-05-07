-- Create table for mission risk assessments
CREATE TABLE public.mission_risk_assessments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  mission_id UUID NOT NULL REFERENCES public.missions(id) ON DELETE CASCADE,
  pilot_id UUID NOT NULL REFERENCES public.profiles(id),
  company_id UUID NOT NULL REFERENCES public.companies(id),
  weather_score NUMERIC(3,1) CHECK (weather_score >= 1 AND weather_score <= 10),
  airspace_score NUMERIC(3,1) CHECK (airspace_score >= 1 AND airspace_score <= 10),
  pilot_experience_score NUMERIC(3,1) CHECK (pilot_experience_score >= 1 AND pilot_experience_score <= 10),
  mission_complexity_score NUMERIC(3,1) CHECK (mission_complexity_score >= 1 AND mission_complexity_score <= 10),
  equipment_score NUMERIC(3,1) CHECK (equipment_score >= 1 AND equipment_score <= 10),
  overall_score NUMERIC(3,1) CHECK (overall_score >= 1 AND overall_score <= 10),
  recommendation TEXT NOT NULL CHECK (recommendation IN ('go', 'caution', 'no-go')),
  ai_analysis JSONB NOT NULL,
  pilot_inputs JSONB,
  weather_data JSONB,
  airspace_warnings JSONB,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.mission_risk_assessments ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Users can view risk assessments from own company" 
ON public.mission_risk_assessments 
FOR SELECT 
USING (company_id = get_user_company_id(auth.uid()));

CREATE POLICY "Approved users can create risk assessments in own company" 
ON public.mission_risk_assessments 
FOR INSERT 
WITH CHECK (
  (company_id = get_user_company_id(auth.uid())) 
  AND (EXISTS (
    SELECT 1 FROM profiles 
    WHERE profiles.id = auth.uid() AND profiles.approved = true
  ))
);

CREATE POLICY "Admins can delete risk assessments in own company" 
ON public.mission_risk_assessments 
FOR DELETE 
USING (
  has_role(auth.uid(), 'admin'::app_role) 
  AND company_id = get_user_company_id(auth.uid())
);

-- Create index for faster queries
CREATE INDEX idx_mission_risk_assessments_mission_id ON public.mission_risk_assessments(mission_id);
CREATE INDEX idx_mission_risk_assessments_company_id ON public.mission_risk_assessments(company_id);
CREATE INDEX idx_mission_risk_assessments_created_at ON public.mission_risk_assessments(created_at DESC);