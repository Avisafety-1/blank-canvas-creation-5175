-- Drop existing function and recreate with route support
DROP FUNCTION IF EXISTS public.check_mission_airspace(double precision, double precision);

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
  v_results jsonb := '[]'::jsonb;
  v_points geometry[];
  v_route_point jsonb;
  v_temp_point geometry;
  
  -- Variables for worst-case tracking per zone type
  v_rpas5km_worst_distance double precision := NULL;
  v_rpas5km_worst_inside boolean := false;
  v_rpas5km_zone_name text := NULL;
  
  v_ctr_worst_distance double precision := NULL;
  v_ctr_worst_inside boolean := false;
  v_ctr_zone_name text := NULL;
  
  v_nsm_worst_distance double precision := NULL;
  v_nsm_worst_inside boolean := false;
  v_nsm_zone_name text := NULL;
  
  v_zone RECORD;
  v_current_distance double precision;
  v_current_inside boolean;
BEGIN
  -- Build array of points to check (start point + all route points)
  v_point := ST_SetSRID(ST_MakePoint(p_lon, p_lat), 4326);
  v_points := ARRAY[v_point];
  
  -- Add route points if provided
  IF p_route_points IS NOT NULL AND jsonb_array_length(p_route_points) > 0 THEN
    FOR v_route_point IN SELECT * FROM jsonb_array_elements(p_route_points)
    LOOP
      v_temp_point := ST_SetSRID(ST_MakePoint(
        (v_route_point->>'lng')::double precision,
        (v_route_point->>'lat')::double precision
      ), 4326);
      v_points := array_append(v_points, v_temp_point);
    END LOOP;
  END IF;

  -- Check RPAS 5km zones - find worst case across all points
  FOR v_zone IN 
    SELECT 
      name,
      geometry
    FROM rpas_5km_zones
    WHERE ST_DWithin(
      geometry::geography,
      v_point::geography,
      50000  -- Check within 50km of start point for efficiency
    )
  LOOP
    -- Check each point against this zone
    FOR i IN 1..array_length(v_points, 1)
    LOOP
      v_current_inside := ST_Contains(v_zone.geometry, v_points[i]);
      v_current_distance := ST_Distance(v_zone.geometry::geography, v_points[i]::geography);
      
      -- Update worst case (inside is worse than close, close is worse than far)
      IF v_current_inside THEN
        IF NOT v_rpas5km_worst_inside THEN
          v_rpas5km_worst_inside := true;
          v_rpas5km_worst_distance := 0;
          v_rpas5km_zone_name := v_zone.name;
        END IF;
      ELSIF v_rpas5km_worst_distance IS NULL OR v_current_distance < v_rpas5km_worst_distance THEN
        IF NOT v_rpas5km_worst_inside THEN
          v_rpas5km_worst_distance := v_current_distance;
          v_rpas5km_zone_name := v_zone.name;
        END IF;
      END IF;
    END LOOP;
  END LOOP;

  -- Check CTR/TIZ zones - find worst case across all points
  FOR v_zone IN 
    SELECT 
      name,
      geometry
    FROM rpas_ctr_tiz
    WHERE ST_DWithin(
      geometry::geography,
      v_point::geography,
      50000
    )
  LOOP
    FOR i IN 1..array_length(v_points, 1)
    LOOP
      v_current_inside := ST_Contains(v_zone.geometry, v_points[i]);
      v_current_distance := ST_Distance(v_zone.geometry::geography, v_points[i]::geography);
      
      IF v_current_inside THEN
        IF NOT v_ctr_worst_inside THEN
          v_ctr_worst_inside := true;
          v_ctr_worst_distance := 0;
          v_ctr_zone_name := v_zone.name;
        END IF;
      ELSIF v_ctr_worst_distance IS NULL OR v_current_distance < v_ctr_worst_distance THEN
        IF NOT v_ctr_worst_inside THEN
          v_ctr_worst_distance := v_current_distance;
          v_ctr_zone_name := v_zone.name;
        END IF;
      END IF;
    END LOOP;
  END LOOP;

  -- Check NSM zones - find worst case across all points
  FOR v_zone IN 
    SELECT 
      name,
      geometry
    FROM nsm_restriction_zones
    WHERE ST_DWithin(
      geometry::geography,
      v_point::geography,
      50000
    )
  LOOP
    FOR i IN 1..array_length(v_points, 1)
    LOOP
      v_current_inside := ST_Contains(v_zone.geometry, v_points[i]);
      v_current_distance := ST_Distance(v_zone.geometry::geography, v_points[i]::geography);
      
      IF v_current_inside THEN
        IF NOT v_nsm_worst_inside THEN
          v_nsm_worst_inside := true;
          v_nsm_worst_distance := 0;
          v_nsm_zone_name := v_zone.name;
        END IF;
      ELSIF v_nsm_worst_distance IS NULL OR v_current_distance < v_nsm_worst_distance THEN
        IF NOT v_nsm_worst_inside THEN
          v_nsm_worst_distance := v_current_distance;
          v_nsm_zone_name := v_zone.name;
        END IF;
      END IF;
    END LOOP;
  END LOOP;

  -- Build results based on worst cases

  -- RPAS 5km zone result
  IF v_rpas5km_worst_inside THEN
    v_results := v_results || jsonb_build_object(
      'zone_type', 'RPAS 5km',
      'zone_name', COALESCE(v_rpas5km_zone_name, 'lufthavn'),
      'distance_meters', 0,
      'is_inside', true,
      'level', 'warning',
      'message', 'Søk ATC om godkjenning. Ruten passerer gjennom RPAS 5 km sone ved ' || COALESCE(v_rpas5km_zone_name, 'lufthavn') || '.'
    );
  ELSIF v_rpas5km_worst_distance IS NOT NULL AND v_rpas5km_worst_distance <= 10000 THEN
    v_results := v_results || jsonb_build_object(
      'zone_type', 'RPAS 5km',
      'zone_name', COALESCE(v_rpas5km_zone_name, 'lufthavn'),
      'distance_meters', ROUND(v_rpas5km_worst_distance::numeric),
      'is_inside', false,
      'level', 'note',
      'message', 'Nærmeste RPAS 5 km sone (' || COALESCE(v_rpas5km_zone_name, 'lufthavn') || ') er ' || ROUND(v_rpas5km_worst_distance::numeric) || ' m unna.'
    );
  END IF;

  -- CTR/TIZ result
  IF v_ctr_worst_inside THEN
    v_results := v_results || jsonb_build_object(
      'zone_type', 'CTR/TIZ',
      'zone_name', COALESCE(v_ctr_zone_name, 'CTR/TIZ'),
      'distance_meters', 0,
      'is_inside', true,
      'level', 'warning',
      'message', 'Din flyging er planlagt under en CTR (' || COALESCE(v_ctr_zone_name, 'CTR/TIZ') || '). Pass på 120m høydebegrensning. Anbefalt å ta kontakt med ATC.'
    );
  ELSIF v_ctr_worst_distance IS NOT NULL AND v_ctr_worst_distance <= 3000 THEN
    v_results := v_results || jsonb_build_object(
      'zone_type', 'CTR/TIZ',
      'zone_name', COALESCE(v_ctr_zone_name, 'CTR/TIZ'),
      'distance_meters', ROUND(v_ctr_worst_distance::numeric),
      'is_inside', false,
      'level', 'caution',
      'message', 'Din flyging er planlagt nært en CTR (' || COALESCE(v_ctr_zone_name, 'CTR/TIZ') || '). Avstand: ' || ROUND(v_ctr_worst_distance::numeric) || ' m.'
    );
  ELSIF v_ctr_worst_distance IS NOT NULL AND v_ctr_worst_distance <= 10000 THEN
    v_results := v_results || jsonb_build_object(
      'zone_type', 'CTR/TIZ',
      'zone_name', COALESCE(v_ctr_zone_name, 'CTR/TIZ'),
      'distance_meters', ROUND(v_ctr_worst_distance::numeric),
      'is_inside', false,
      'level', 'note',
      'message', 'Nærmeste CTR (' || COALESCE(v_ctr_zone_name, 'CTR/TIZ') || ') er ' || ROUND(v_ctr_worst_distance::numeric) || ' m unna.'
    );
  END IF;

  -- NSM result
  IF v_nsm_worst_inside THEN
    v_results := v_results || jsonb_build_object(
      'zone_type', 'NSM',
      'zone_name', COALESCE(v_nsm_zone_name, 'NSM-sone'),
      'distance_meters', 0,
      'is_inside', true,
      'level', 'warning',
      'message', 'Oppdraget er innenfor NSM forbudsområde (' || COALESCE(v_nsm_zone_name, 'NSM-sone') || '). Søk dispensasjon hos NSM før flyving.'
    );
  ELSIF v_nsm_worst_distance IS NOT NULL AND v_nsm_worst_distance <= 3000 THEN
    v_results := v_results || jsonb_build_object(
      'zone_type', 'NSM',
      'zone_name', COALESCE(v_nsm_zone_name, 'NSM-sone'),
      'distance_meters', ROUND(v_nsm_worst_distance::numeric),
      'is_inside', false,
      'level', 'caution',
      'message', 'Din flyging er planlagt nært et NSM forbudsområde (' || COALESCE(v_nsm_zone_name, 'NSM-sone') || '). Avstand: ' || ROUND(v_nsm_worst_distance::numeric) || ' m.'
    );
  ELSIF v_nsm_worst_distance IS NOT NULL AND v_nsm_worst_distance <= 10000 THEN
    v_results := v_results || jsonb_build_object(
      'zone_type', 'NSM',
      'zone_name', COALESCE(v_nsm_zone_name, 'NSM-sone'),
      'distance_meters', ROUND(v_nsm_worst_distance::numeric),
      'is_inside', false,
      'level', 'note',
      'message', 'Nærmeste NSM forbudsområde (' || COALESCE(v_nsm_zone_name, 'NSM-sone') || ') er ' || ROUND(v_nsm_worst_distance::numeric) || ' m unna.'
    );
  END IF;

  RETURN v_results;
END;
$$;