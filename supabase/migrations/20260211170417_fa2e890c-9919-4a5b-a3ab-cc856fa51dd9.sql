
-- Create RPC function to upsert OpenAIP airspace data with PostGIS geometry
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
  )
  ON CONFLICT (openaip_id)
  DO UPDATE SET
    zone_id = EXCLUDED.zone_id,
    zone_type = EXCLUDED.zone_type,
    name = EXCLUDED.name,
    geometry = EXCLUDED.geometry,
    upper_limit = EXCLUDED.upper_limit,
    lower_limit = EXCLUDED.lower_limit,
    remarks = EXCLUDED.remarks,
    properties = EXCLUDED.properties,
    source = 'openaip',
    synced_at = now(),
    external_id = EXCLUDED.external_id;
END;
$$;
