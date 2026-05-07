-- Add incident_number column to incidents table
ALTER TABLE public.incidents 
ADD COLUMN incident_number TEXT UNIQUE;

-- Create index for faster lookups by incident_number prefix (date)
CREATE INDEX idx_incidents_incident_number ON public.incidents (incident_number);