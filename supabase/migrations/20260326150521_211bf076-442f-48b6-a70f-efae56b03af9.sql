-- 1. Create naturvern_zones table
CREATE TABLE IF NOT EXISTS public.naturvern_zones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  external_id text,
  name text,
  description text,
  verneform text,
  geometry geometry,
  properties jsonb,
  synced_at timestamptz DEFAULT now()
);

ALTER TABLE public.naturvern_zones ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read naturvern_zones"
  ON public.naturvern_zones FOR SELECT TO authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_naturvern_zones_geometry ON public.naturvern_zones USING GIST (geometry);
CREATE INDEX IF NOT EXISTS idx_naturvern_zones_external_id ON public.naturvern_zones (external_id);

-- 2. Create vern_restriction_zones table
CREATE TABLE IF NOT EXISTS public.vern_restriction_zones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  external_id text,
  name text,
  description text,
  restriction_type text,
  geometry geometry,
  properties jsonb,
  synced_at timestamptz DEFAULT now()
);

ALTER TABLE public.vern_restriction_zones ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read vern_restriction_zones"
  ON public.vern_restriction_zones FOR SELECT TO authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_vern_restriction_zones_geometry ON public.vern_restriction_zones USING GIST (geometry);
CREATE INDEX IF NOT EXISTS idx_vern_restriction_zones_external_id ON public.vern_restriction_zones (external_id);

-- 3. Update check_mission_airspace to include new zone types
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
  v_route_line geometry;
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

    IF jsonb_array_length(p_route) >= 2 THEN
      WITH ordered_points AS (
        SELECT ST_SetSRID(ST_MakePoint(
          (elem->>'lng')::double precision,
          (elem->>'lat')::double precision
        ), 4326) AS geom
        FROM jsonb_array_elements(p_route) WITH ORDINALITY AS t(elem, ord)
        ORDER BY ord
      )
      SELECT ST_MakeLine(array_agg(geom)) INTO v_route_line FROM ordered_points;
    ELSE
      v_route_line := NULL;
    END IF;
  ELSE
    v_envelope := v_point;
    v_route_line := NULL;
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

    UNION ALL

    SELECT
      nv.id::text,
      'NATURVERN',
      COALESCE(nv.name, 'Ukjent'),
      nv.geometry
    FROM naturvern_zones nv
    WHERE nv.geometry IS NOT NULL
      AND ST_DWithin(nv.geometry::geography, v_envelope::geography, 5000)

    UNION ALL

    SELECT
      vr.id::text,
      UPPER(COALESCE(vr.restriction_type, 'VERN_RESTRIKSJON')),
      COALESCE(vr.name, 'Ukjent'),
      vr.geometry
    FROM vern_restriction_zones vr
    WHERE vr.geometry IS NOT NULL
      AND ST_DWithin(vr.geometry::geography, v_envelope::geography, 5000)
  ),
  route_check AS (
    SELECT
      cz.cz_id,
      cz.cz_type,
      cz.cz_name,
      cz.cz_geom,
      CASE
        WHEN v_route_line IS NOT NULL THEN
          ST_Intersects(v_route_line, cz.cz_geom)
        WHEN p_route IS NOT NULL AND jsonb_array_length(p_route) > 0 THEN
          ST_Within(
            ST_SetSRID(ST_MakePoint(
              (p_route->0->>'lng')::double precision,
              (p_route->0->>'lat')::double precision
            ), 4326),
            cz.cz_geom
          )
        ELSE
          ST_Within(v_point, cz.cz_geom)
      END AS ri,
      CASE
        WHEN v_route_line IS NOT NULL THEN
          ST_Distance(v_route_line::geography, cz.cz_geom::geography)
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
      WHEN rc.cz_type IN ('P', 'R', 'NSM') THEN 'WARNING'
      WHEN rc.cz_type IN ('D', 'RMZ', 'TMZ', 'ATZ', '5KM') THEN 'CAUTION'
      WHEN rc.cz_type IN ('CTR', 'TIZ') THEN 'INFO'
      WHEN rc.cz_type IN ('FERDSELSFORBUD', 'LANDINGSFORBUD') THEN 'WARNING'
      WHEN rc.cz_type = 'LAVFLYVING' THEN 'CAUTION'
      WHEN rc.cz_type = 'NATURVERN' THEN 'INFO'
      ELSE 'INFO'
    END
  FROM route_check rc
  WHERE rc.ri = true OR rc.md < 5000;
END;
$$;