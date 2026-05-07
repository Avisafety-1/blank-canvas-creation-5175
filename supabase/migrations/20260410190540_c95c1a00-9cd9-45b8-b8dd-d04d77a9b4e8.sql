UPDATE public.notams 
SET geometry_geojson = NULL 
WHERE properties->>'qline' LIKE '%/A/%' 
  AND properties->>'qline' ~ '/[A-Z]/\d{3}/\d{3}/'
  AND geometry_geojson IS NOT NULL
  AND notam_text NOT LIKE '%polygon%';