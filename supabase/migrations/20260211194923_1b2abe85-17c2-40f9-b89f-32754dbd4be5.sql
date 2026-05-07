
-- Ny tabell for OpenAIP hindringer (obstacles)
CREATE TABLE public.openaip_obstacles (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  openaip_id text NOT NULL UNIQUE,
  name text,
  type text,
  geometry geometry(Point, 4326),
  elevation numeric,
  height_agl numeric,
  properties jsonb DEFAULT '{}'::jsonb,
  synced_at timestamp with time zone DEFAULT now()
);

-- Indeks for spatial queries
CREATE INDEX idx_openaip_obstacles_geometry ON public.openaip_obstacles USING GIST (geometry);
CREATE INDEX idx_openaip_obstacles_openaip_id ON public.openaip_obstacles (openaip_id);

-- RLS
ALTER TABLE public.openaip_obstacles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read obstacles"
  ON public.openaip_obstacles
  FOR SELECT
  USING (true);

-- Utvid check_mission_airspace til å også sjekke RMZ/TMZ/ATZ
CREATE OR REPLACE FUNCTION public.check_mission_airspace(
  p_lat double precision,
  p_lon double precision,
  p_route_points jsonb DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_point geometry;
  v_warnings jsonb := '[]'::jsonb;
  v_zone record;
  v_distance double precision;
  v_is_inside boolean;
  v_points geometry[];
  v_envelope geometry;
BEGIN
  v_point := ST_SetSRID(ST_MakePoint(p_lon, p_lat), 4326);
  v_points := ARRAY[v_point];

  IF p_route_points IS NOT NULL AND jsonb_array_length(p_route_points) > 0 THEN
    FOR i IN 0..jsonb_array_length(p_route_points) - 1 LOOP
      v_points := array_append(v_points,
        ST_SetSRID(ST_MakePoint(
          (p_route_points->i->>'lng')::double precision,
          (p_route_points->i->>'lat')::double precision
        ), 4326)
      );
    END LOOP;
  END IF;

  IF array_length(v_points, 1) > 2 THEN
    v_envelope := ST_ConvexHull(ST_Collect(v_points));
  ELSIF array_length(v_points, 1) = 2 THEN
    v_envelope := ST_MakeLine(v_points);
  ELSE
    v_envelope := v_point;
  END IF;

  -- RPAS 5km zones
  FOR v_zone IN
    SELECT zone_id, name, geometry FROM rpas_5km_zones
    WHERE ST_DWithin(geometry::geography, v_envelope::geography, 50000)
  LOOP
    v_is_inside := ST_Intersects(v_envelope, v_zone.geometry);
    v_distance := ST_Distance(v_envelope::geography, v_zone.geometry::geography);
    IF v_is_inside OR v_distance < 5000 THEN
      v_warnings := v_warnings || jsonb_build_object(
        'zone_type', 'RPAS_5KM',
        'zone_name', COALESCE(v_zone.name, v_zone.zone_id),
        'distance_meters', round(v_distance::numeric, 0),
        'is_inside', v_is_inside,
        'severity', 'WARNING'
      );
    END IF;
  END LOOP;

  -- CTR/TIZ zones
  FOR v_zone IN
    SELECT zone_id, name, geometry FROM rpas_ctr_tiz
    WHERE ST_DWithin(geometry::geography, v_envelope::geography, 50000)
  LOOP
    v_is_inside := ST_Intersects(v_envelope, v_zone.geometry);
    v_distance := ST_Distance(v_envelope::geography, v_zone.geometry::geography);
    IF v_is_inside OR v_distance < 5000 THEN
      v_warnings := v_warnings || jsonb_build_object(
        'zone_type', 'CTR_TIZ',
        'zone_name', COALESCE(v_zone.name, v_zone.zone_id),
        'distance_meters', round(v_distance::numeric, 0),
        'is_inside', v_is_inside,
        'severity', 'WARNING'
      );
    END IF;
  END LOOP;

  -- NSM zones
  FOR v_zone IN
    SELECT zone_id, name, geometry FROM nsm_restriction_zones
    WHERE ST_DWithin(geometry::geography, v_envelope::geography, 50000)
  LOOP
    v_is_inside := ST_Intersects(v_envelope, v_zone.geometry);
    v_distance := ST_Distance(v_envelope::geography, v_zone.geometry::geography);
    IF v_is_inside OR v_distance < 5000 THEN
      v_warnings := v_warnings || jsonb_build_object(
        'zone_type', 'NSM',
        'zone_name', COALESCE(v_zone.name, v_zone.zone_id),
        'distance_meters', round(v_distance::numeric, 0),
        'is_inside', v_is_inside,
        'severity', 'WARNING'
      );
    END IF;
  END LOOP;

  -- AIP restriction zones (P, R, D)
  FOR v_zone IN
    SELECT zone_id, zone_type, name, geometry FROM aip_restriction_zones
    WHERE zone_type IN ('P', 'R', 'D')
    AND ST_DWithin(geometry::geography, v_envelope::geography, 50000)
  LOOP
    v_is_inside := ST_Intersects(v_envelope, v_zone.geometry);
    v_distance := ST_Distance(v_envelope::geography, v_zone.geometry::geography);
    IF v_is_inside OR v_distance < 2000 THEN
      v_warnings := v_warnings || jsonb_build_object(
        'zone_type', v_zone.zone_type,
        'zone_name', COALESCE(v_zone.name, v_zone.zone_id),
        'distance_meters', round(v_distance::numeric, 0),
        'is_inside', v_is_inside,
        'severity', CASE WHEN v_zone.zone_type = 'D' THEN 'CAUTION' ELSE 'WARNING' END
      );
    END IF;
  END LOOP;

  -- RMZ zones (Radio Mandatory Zone) - CAUTION
  FOR v_zone IN
    SELECT zone_id, zone_type, name, geometry FROM aip_restriction_zones
    WHERE zone_type = 'RMZ'
    AND ST_DWithin(geometry::geography, v_envelope::geography, 50000)
  LOOP
    v_is_inside := ST_Intersects(v_envelope, v_zone.geometry);
    v_distance := ST_Distance(v_envelope::geography, v_zone.geometry::geography);
    IF v_is_inside OR v_distance < 2000 THEN
      v_warnings := v_warnings || jsonb_build_object(
        'zone_type', 'RMZ',
        'zone_name', COALESCE(v_zone.name, v_zone.zone_id),
        'distance_meters', round(v_distance::numeric, 0),
        'is_inside', v_is_inside,
        'severity', 'CAUTION'
      );
    END IF;
  END LOOP;

  -- TMZ zones (Transponder Mandatory Zone) - CAUTION
  FOR v_zone IN
    SELECT zone_id, zone_type, name, geometry FROM aip_restriction_zones
    WHERE zone_type = 'TMZ'
    AND ST_DWithin(geometry::geography, v_envelope::geography, 50000)
  LOOP
    v_is_inside := ST_Intersects(v_envelope, v_zone.geometry);
    v_distance := ST_Distance(v_envelope::geography, v_zone.geometry::geography);
    IF v_is_inside OR v_distance < 2000 THEN
      v_warnings := v_warnings || jsonb_build_object(
        'zone_type', 'TMZ',
        'zone_name', COALESCE(v_zone.name, v_zone.zone_id),
        'distance_meters', round(v_distance::numeric, 0),
        'is_inside', v_is_inside,
        'severity', 'CAUTION'
      );
    END IF;
  END LOOP;

  -- ATZ zones (Aerodrome Traffic Zone) - INFO
  FOR v_zone IN
    SELECT zone_id, zone_type, name, geometry FROM aip_restriction_zones
    WHERE zone_type = 'ATZ'
    AND ST_DWithin(geometry::geography, v_envelope::geography, 50000)
  LOOP
    v_is_inside := ST_Intersects(v_envelope, v_zone.geometry);
    v_distance := ST_Distance(v_envelope::geography, v_zone.geometry::geography);
    IF v_is_inside OR v_distance < 2000 THEN
      v_warnings := v_warnings || jsonb_build_object(
        'zone_type', 'ATZ',
        'zone_name', COALESCE(v_zone.name, v_zone.zone_id),
        'distance_meters', round(v_distance::numeric, 0),
        'is_inside', v_is_inside,
        'severity', 'INFO'
      );
    END IF;
  END LOOP;

  RETURN v_warnings;
END;
$$;
