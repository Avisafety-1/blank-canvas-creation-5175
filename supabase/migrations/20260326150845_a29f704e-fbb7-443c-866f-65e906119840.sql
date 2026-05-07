-- Create dedicated upsert function for vern_restriction_zones
CREATE OR REPLACE FUNCTION public.upsert_vern_restriction(
  p_external_id text,
  p_name text,
  p_restriction_type text,
  p_geometry_geojson text,
  p_properties jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_geometry geometry;
BEGIN
  v_geometry := ST_SetSRID(ST_GeomFromGeoJSON(p_geometry_geojson), 4326);
  
  INSERT INTO vern_restriction_zones (external_id, name, restriction_type, geometry, properties, synced_at, updated_at)
  VALUES (p_external_id, p_name, p_restriction_type, v_geometry, p_properties, now(), now())
  ON CONFLICT (external_id)
  DO UPDATE SET
    name = EXCLUDED.name,
    restriction_type = EXCLUDED.restriction_type,
    geometry = EXCLUDED.geometry,
    properties = EXCLUDED.properties,
    synced_at = now(),
    updated_at = now()
  RETURNING id INTO v_id;
  
  RETURN v_id;
END;
$$;

-- Create dedicated upsert for naturvern_zones (with verneform)
CREATE OR REPLACE FUNCTION public.upsert_naturvern_zone(
  p_external_id text,
  p_name text,
  p_verneform text,
  p_geometry_geojson text,
  p_properties jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_geometry geometry;
BEGIN
  v_geometry := ST_SetSRID(ST_GeomFromGeoJSON(p_geometry_geojson), 4326);
  
  INSERT INTO naturvern_zones (external_id, name, verneform, geometry, properties, synced_at, updated_at)
  VALUES (p_external_id, p_name, p_verneform, v_geometry, p_properties, now(), now())
  ON CONFLICT (external_id)
  DO UPDATE SET
    name = EXCLUDED.name,
    verneform = EXCLUDED.verneform,
    geometry = EXCLUDED.geometry,
    properties = EXCLUDED.properties,
    synced_at = now(),
    updated_at = now()
  RETURNING id INTO v_id;
  
  RETURN v_id;
END;
$$;