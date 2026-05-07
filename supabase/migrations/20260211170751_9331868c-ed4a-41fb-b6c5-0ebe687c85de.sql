
-- Drop the conditional unique index and create a non-conditional one
DROP INDEX IF EXISTS idx_aip_restriction_zones_openaip_id;
CREATE UNIQUE INDEX idx_aip_restriction_zones_openaip_id ON aip_restriction_zones (openaip_id) WHERE openaip_id IS NOT NULL;

-- Update the upsert function to use a different approach: delete + insert
CREATE OR REPLACE FUNCTION public.upsert_openaip_airspace(
  p_openaip_id text,
  p_zone_id text,
  p_zone_type text,
  p_name text,
  p_geometry_geojson text,
  p_upper_limit text DEFAULT NULL,
  p_lower_limit text DEFAULT NULL,
  p_remarks text DEFAULT NULL,
  p_properties text DEFAULT '{}'
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Delete existing record with same openaip_id
  DELETE FROM aip_restriction_zones WHERE openaip_id = p_openaip_id;
  
  -- Insert new record
  INSERT INTO aip_restriction_zones (
    openaip_id, zone_id, zone_type, name, geometry,
    upper_limit, lower_limit, remarks, properties,
    source, synced_at, external_id
  )
  VALUES (
    p_openaip_id,
    p_zone_id,
    p_zone_type,
    p_name,
    ST_SetSRID(ST_GeomFromGeoJSON(p_geometry_geojson), 4326),
    p_upper_limit,
    p_lower_limit,
    p_remarks,
    p_properties::jsonb,
    'openaip',
    now(),
    p_openaip_id
  );
END;
$$;
