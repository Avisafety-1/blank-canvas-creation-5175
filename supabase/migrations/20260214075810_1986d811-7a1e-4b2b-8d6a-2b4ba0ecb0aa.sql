
CREATE TABLE public.terrain_elevation_cache (
  lat_lng_key TEXT PRIMARY KEY,
  elevation REAL NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.terrain_elevation_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read terrain cache"
ON public.terrain_elevation_cache
FOR SELECT
USING (auth.uid() IS NOT NULL);

CREATE POLICY "Service role can insert terrain cache"
ON public.terrain_elevation_cache
FOR INSERT
WITH CHECK (true);
