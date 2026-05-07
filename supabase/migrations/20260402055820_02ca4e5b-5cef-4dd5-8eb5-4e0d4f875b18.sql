
-- Create notams table for caching NOTAM data from Laminar API
CREATE TABLE public.notams (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  notam_id TEXT NOT NULL UNIQUE,
  series TEXT,
  number INTEGER NOT NULL,
  year INTEGER NOT NULL,
  location TEXT,
  country_code TEXT,
  qcode TEXT,
  scope TEXT,
  traffic TEXT,
  purpose TEXT,
  notam_type TEXT,
  notam_text TEXT,
  effective_start TIMESTAMPTZ,
  effective_end TIMESTAMPTZ,
  effective_end_interpretation TEXT,
  minimum_fl INTEGER,
  maximum_fl INTEGER,
  center_lat DOUBLE PRECISION,
  center_lng DOUBLE PRECISION,
  geometry_geojson JSONB,
  properties JSONB,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.notams ENABLE ROW LEVEL SECURITY;

-- Authenticated users can read
CREATE POLICY "Authenticated users can read notams"
ON public.notams
FOR SELECT
TO authenticated
USING (true);

-- Indexes for performance
CREATE INDEX idx_notams_effective_end ON public.notams (effective_end);
CREATE INDEX idx_notams_center ON public.notams (center_lat, center_lng) WHERE center_lat IS NOT NULL;
CREATE INDEX idx_notams_notam_id ON public.notams (notam_id);
