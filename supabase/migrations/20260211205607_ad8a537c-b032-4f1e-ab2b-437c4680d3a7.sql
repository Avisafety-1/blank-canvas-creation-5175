
DROP FUNCTION IF EXISTS public.check_mission_airspace(double precision, double precision, jsonb);

CREATE OR REPLACE FUNCTION public.check_mission_airspace(
  p_lat double precision,
  p_lng double precision,
  p_route jsonb DEFAULT NULL
)
RETURNS TABLE(
  z_id text,
  z_type text,
  z_name text,
  min_distance double precision,
  route_inside boolean,
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
      z.zone_id AS cz_id,
      z.zone_type AS cz_type,
      COALESCE(z.name, z.zone_id) AS cz_name,
      z.geometry AS cz_geom
    FROM aip_restriction_zones z
    WHERE z.geometry IS NOT NULL
      AND ST_DWithin(z.geometry::geography, v_envelope::geography, 50000)

    UNION ALL

    SELECT
      c.id::text,
      COALESCE(c.properties->>'Zone', 'CTR'),
      COALESCE(c.properties->>'NAVN', c.name, 'Ukjent'),
      c.geometry
    FROM rpas_ctr_tiz c
    WHERE c.geometry IS NOT NULL
      AND ST_DWithin(c.geometry::geography, v_envelope::geography, 50000)

    UNION ALL

    SELECT
      n.id::text,
      'NSM',
      COALESCE(n.properties->>'navn', n.name, 'Ukjent'),
      n.geometry
    FROM nsm_restriction_zones n
    WHERE n.geometry IS NOT NULL
      AND ST_DWithin(n.geometry::geography, v_envelope::geography, 50000)

    UNION ALL

    SELECT
      a.id::text,
      '5KM',
      COALESCE(a.properties->>'NAVN', a.name, 'Ukjent'),
      a.geometry
    FROM rpas_5km_zones a
    WHERE a.geometry IS NOT NULL
      AND ST_DWithin(a.geometry::geography, v_envelope::geography, 50000)
  ),
  route_check AS (
    SELECT
      cz.cz_id,
      cz.cz_type,
      cz.cz_name,
      cz.cz_geom,
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
              cz.cz_geom
            )
          )
        ELSE
          ST_Within(v_point, cz.cz_geom)
      END AS ri,
      CASE
        WHEN p_route IS NOT NULL AND jsonb_array_length(p_route) > 0 THEN
          (SELECT MIN(ST_Distance(
            ST_SetSRID(ST_MakePoint(
              (elem->>'lng')::double precision,
              (elem->>'lat')::double precision
            ), 4326)::geography,
            cz.cz_geom::geography
          ))
          FROM jsonb_array_elements(p_route) AS elem)
        ELSE
          ST_Distance(v_point::geography, cz.cz_geom::geography)
      END AS md
    FROM candidate_zones cz
  )
  SELECT
    rc.cz_id,
    rc.cz_type,
    rc.cz_name,
    rc.md,
    rc.ri,
    CASE
      WHEN rc.cz_type IN ('P', 'R', 'CTR', 'NSM') THEN 'WARNING'
      WHEN rc.cz_type IN ('D', 'RMZ', 'TMZ', 'TIZ', 'ATZ', '5KM') THEN 'CAUTION'
      ELSE 'INFO'
    END
  FROM route_check rc
  WHERE rc.ri = true OR rc.md < 5000;
END;
$$;
