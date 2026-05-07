-- Create incident_eccairs_mappings table for storing ECCAIRS taxonomy mappings
CREATE TABLE incident_eccairs_mappings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_id uuid NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
  company_id uuid NOT NULL,
  
  -- Occurrence Class (VL431)
  occurrence_class text,
  
  -- Phase of Flight (VL1072)
  phase_of_flight text,
  
  -- Aircraft Category (VL17) - default UAS/RPAS
  aircraft_category text DEFAULT '104',
  
  -- Event Types (kan ha flere)
  event_types text[],
  
  -- Fritekst for ECCAIRS
  headline text,
  narrative text,
  
  -- Lokasjon (strukturert)
  location_name text,
  latitude numeric,
  longitude numeric,
  
  -- Metadata
  created_by uuid,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  
  UNIQUE(incident_id)
);

-- Enable RLS
ALTER TABLE incident_eccairs_mappings ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Users can view mappings from own company"
  ON incident_eccairs_mappings FOR SELECT
  USING (company_id = get_user_company_id(auth.uid()));

CREATE POLICY "Approved users can create mappings"
  ON incident_eccairs_mappings FOR INSERT
  WITH CHECK (
    company_id = get_user_company_id(auth.uid())
    AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND approved = true)
  );

CREATE POLICY "Users can update mappings in own company"
  ON incident_eccairs_mappings FOR UPDATE
  USING (company_id = get_user_company_id(auth.uid()));

CREATE POLICY "Admins can delete mappings in own company"
  ON incident_eccairs_mappings FOR DELETE
  USING (
    has_role(auth.uid(), 'admin') 
    AND company_id = get_user_company_id(auth.uid())
  );

-- Create updated_at trigger
CREATE TRIGGER update_incident_eccairs_mappings_updated_at
  BEFORE UPDATE ON incident_eccairs_mappings
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Create indexes for performance
CREATE INDEX idx_incident_eccairs_mappings_incident ON incident_eccairs_mappings(incident_id);
CREATE INDEX idx_incident_eccairs_mappings_company ON incident_eccairs_mappings(company_id);