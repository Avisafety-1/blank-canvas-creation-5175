-- Update the zone_type check constraint to allow new types
ALTER TABLE public.aip_restriction_zones DROP CONSTRAINT IF EXISTS aip_restriction_zones_zone_type_check;

ALTER TABLE public.aip_restriction_zones ADD CONSTRAINT aip_restriction_zones_zone_type_check 
  CHECK (zone_type IN ('P', 'R', 'D', 'RMZ', 'TMZ', 'ATZ', 'TIZ', 'CTR'));

-- Drop and recreate check_mission_airspace to handle TIZ zones
DROP FUNCTION IF EXISTS public.check_mission_airspace(double precision, double precision, jsonb);

CREATE OR REPLACE FUNCTION public.check_mission_airspace(
  p_lat double precision,
  p_lng double precision,
  p_route jsonb DEFAULT NULL
)
RETURNS TABLE(
  zone_id text,
  zone_type text,
  zone_name text,
  distance_meters double precision,
  is_inside boolean,
  severity text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_point geometry;
  v_envelope geometry;
BEGIN
  v_point := ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326);

  IF p_route IS NOT NULL AND jsonb_array_length(p_route) > 0 THEN
    WITH route_points AS (
      SELECT ST_SetSRID(ST_MakePoint(
        (elem->>'lng')::double precision,
        (elem->>'lat')::double precision
      ), 4326) AS geom
      FROM jsonb_array_elements(p_route) AS elem
    )
    SELECT ST_ConvexHull(ST_Collect(geom)) INTO v_envelope FROM route_points;
  ELSE
    v_envelope := v_point;
  END IF;

  RETURN QUERY
  WITH candidate_zones AS (
    SELECT
      z.zone_id AS z_id,
      z.zone_type AS z_type,
      COALESCE(z.name, z.zone_id) AS z_name,
      z.geometry AS z_geom
    FROM aip_restriction_zones z
    WHERE z.geometry IS NOT NULL
      AND ST_DWithin(z.geometry::geography, v_envelope::geography, 50000)
  ),
  route_check AS (
    SELECT
      cz.z_id,
      cz.z_type,
      cz.z_name,
      cz.z_geom,
      CASE
        WHEN p_route IS NOT NULL AND jsonb_array_length(p_route) > 0 THEN
          EXISTS (
            SELECT 1
            FROM jsonb_array_elements(p_route) AS elem
            WHERE ST_Within(
              ST_SetSRID(ST_MakePoint(
                (elem->>'lng')::double precision,
                (elem->>'lat')::double precision
              ), 4326),
              cz.z_geom
            )
          )
        ELSE
          ST_Within(v_point, cz.z_geom)
      END AS route_inside,
      CASE
        WHEN p_route IS NOT NULL AND jsonb_array_length(p_route) > 0 THEN
          (SELECT MIN(ST_Distance(
            ST_SetSRID(ST_MakePoint(
              (elem->>'lng')::double precision,
              (elem->>'lat')::double precision
            ), 4326)::geography,
            cz.z_geom::geography
          ))
          FROM jsonb_array_elements(p_route) AS elem)
        ELSE
          ST_Distance(v_point::geography, cz.z_geom::geography)
      END AS min_distance
    FROM candidate_zones cz
  )
  SELECT
    rc.z_id,
    rc.z_type,
    rc.z_name,
    rc.min_distance,
    rc.route_inside,
    CASE
      WHEN rc.z_type IN ('P', 'R') THEN 'WARNING'
      WHEN rc.z_type IN ('RMZ', 'TMZ', 'TIZ', 'ATZ', 'CTR') THEN 'CAUTION'
      WHEN rc.z_type = 'D' THEN 'CAUTION'
      ELSE 'INFO'
    END AS severity
  FROM route_check rc
  WHERE rc.route_inside = true OR rc.min_distance < 5000;
END;
$$;