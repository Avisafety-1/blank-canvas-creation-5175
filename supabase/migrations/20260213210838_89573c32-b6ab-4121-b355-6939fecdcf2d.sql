ALTER TABLE mission_risk_assessments 
ADD COLUMN pilot_comments jsonb DEFAULT '{}'::jsonb;