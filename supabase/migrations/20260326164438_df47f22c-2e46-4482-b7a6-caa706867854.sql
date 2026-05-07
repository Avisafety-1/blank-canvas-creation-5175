
-- GIST indexes for spatial queries (if not exists)
CREATE INDEX IF NOT EXISTS idx_naturvern_zones_geometry_gist ON naturvern_zones USING GIST (geometry);
CREATE INDEX IF NOT EXISTS idx_vern_restriction_zones_geometry_gist ON vern_restriction_zones USING GIST (geometry);

-- RPC: get naturvern zones within bounding box
CREATE OR REPLACE FUNCTION get_naturvern_in_bounds(
  min_lat double precision,
  min_lng double precision,
  max_lat double precision,
  max_lng double precision
)
RETURNS TABLE (
  external_id text,
  name text,
  verneform text,
  geometry jsonb,
  properties jsonb
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    nz.external_id,
    nz.name,
    nz.verneform,
    ST_AsGeoJSON(nz.geometry)::jsonb AS geometry,
    nz.properties
  FROM naturvern_zones nz
  WHERE ST_Intersects(
    nz.geometry,
    ST_MakeEnvelope(min_lng, min_lat, max_lng, max_lat, 4326)
  )
  LIMIT 500;
$$;

-- RPC: get vern restriction zones within bounding box
CREATE OR REPLACE FUNCTION get_vern_restrictions_in_bounds(
  min_lat double precision,
  min_lng double precision,
  max_lat double precision,
  max_lng double precision
)
RETURNS TABLE (
  external_id text,
  name text,
  restriction_type text,
  geometry jsonb,
  properties jsonb
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    vr.external_id,
    vr.name,
    vr.restriction_type,
    ST_AsGeoJSON(vr.geometry)::jsonb AS geometry,
    vr.properties
  FROM vern_restriction_zones vr
  WHERE ST_Intersects(
    vr.geometry,
    ST_MakeEnvelope(min_lng, min_lat, max_lng, max_lat, 4326)
  )
  LIMIT 500;
$$;
