
CREATE OR REPLACE FUNCTION public.check_mission_airspace(p_lat double precision, p_lon double precision, p_route_points jsonb DEFAULT NULL)
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
  v_envelope geometry;
  
  v_rpas5km_worst_distance double precision := NULL;
  v_rpas5km_worst_inside boolean := false;
  v_rpas5km_zone_name text := NULL;
  
  v_ctr_worst_distance double precision := NULL;
  v_ctr_worst_inside boolean := false;
  v_ctr_zone_name text := NULL;
  v_ctr_zone_type text := NULL;
  v_ctr_worst_point geometry := NULL;
  
  v_nsm_worst_distance double precision := NULL;
  v_nsm_worst_inside boolean := false;
  v_nsm_zone_name text := NULL;

  -- AIP: now per-zone tracking
  v_aip_zone RECORD;
  v_aip_current_distance double precision;
  v_aip_current_inside boolean;
  v_aip_zone_worst_distance double precision;
  v_aip_zone_inside boolean;
  
  v_zone RECORD;
  v_current_distance double precision;
  v_current_inside boolean;
  v_nearest_airport text;
BEGIN
  v_point := ST_SetSRID(ST_MakePoint(p_lon, p_lat), 4326);
  v_points := ARRAY[v_point];
  
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

  -- Build envelope covering the full route extent for candidate filtering
  v_envelope := ST_ConvexHull(ST_Collect(v_points));

  -- Check RPAS 5km zones
  FOR v_zone IN 
    SELECT name, geometry FROM rpas_5km_zones
    WHERE ST_DWithin(geometry::geography, v_envelope::geography, 50000)
  LOOP
    FOR i IN 1..array_length(v_points, 1)
    LOOP
      v_current_inside := ST_Contains(v_zone.geometry, v_points[i]);
      v_current_distance := ST_Distance(v_zone.geometry::geography, v_points[i]::geography);
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

  -- Check CTR/TIZ zones
  FOR v_zone IN 
    SELECT name, geometry, properties->>'Zone' as zone_type FROM rpas_ctr_tiz
    WHERE ST_DWithin(geometry::geography, v_envelope::geography, 50000)
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
          v_ctr_zone_type := v_zone.zone_type;
          v_ctr_worst_point := v_points[i];
        END IF;
      ELSIF v_ctr_worst_distance IS NULL OR v_current_distance < v_ctr_worst_distance THEN
        IF NOT v_ctr_worst_inside THEN
          v_ctr_worst_distance := v_current_distance;
          v_ctr_zone_name := v_zone.name;
          v_ctr_zone_type := v_zone.zone_type;
          v_ctr_worst_point := v_points[i];
        END IF;
      END IF;
    END LOOP;
  END LOOP;

  IF v_ctr_worst_point IS NOT NULL AND (v_ctr_zone_name IS NULL OR v_ctr_zone_name = 'Ukjent' OR v_ctr_zone_name = '') THEN
    SELECT name INTO v_nearest_airport FROM rpas_5km_zones
    WHERE name IS NOT NULL AND name != ''
    ORDER BY ST_Distance(geometry::geography, v_ctr_worst_point::geography) LIMIT 1;
    IF v_nearest_airport IS NOT NULL THEN v_ctr_zone_name := v_nearest_airport; END IF;
  END IF;

  -- Check NSM zones
  FOR v_zone IN 
    SELECT name, geometry FROM nsm_restriction_zones
    WHERE ST_DWithin(geometry::geography, v_envelope::geography, 50000)
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

  -- Check AIP restriction zones - reports ALL intersecting zones
  FOR v_aip_zone IN 
    SELECT zone_id, zone_type, name, upper_limit, remarks, geometry
    FROM aip_restriction_zones
    WHERE geometry IS NOT NULL
      AND ST_DWithin(geometry::geography, v_envelope::geography, 50000)
  LOOP
    v_aip_zone_inside := false;
    v_aip_zone_worst_distance := NULL;
    
    FOR i IN 1..array_length(v_points, 1)
    LOOP
      v_aip_current_inside := ST_Contains(v_aip_zone.geometry, v_points[i]);
      v_aip_current_distance := ST_Distance(v_aip_zone.geometry::geography, v_points[i]::geography);
      IF v_aip_current_inside THEN
        v_aip_zone_inside := true;
        v_aip_zone_worst_distance := 0;
      ELSIF NOT v_aip_zone_inside THEN
        IF v_aip_zone_worst_distance IS NULL OR v_aip_current_distance < v_aip_zone_worst_distance THEN
          v_aip_zone_worst_distance := v_aip_current_distance;
        END IF;
      END IF;
    END LOOP;

    -- Add result for this zone if inside or within 5km
    IF v_aip_zone_inside THEN
      IF v_aip_zone.zone_type = 'P' THEN
        v_results := v_results || jsonb_build_object(
          'zone_type', 'AIP Forbudsområde',
          'zone_name', COALESCE(v_aip_zone.zone_id, '') || ' ' || COALESCE(v_aip_zone.name, ''),
          'distance_meters', 0, 'is_inside', true, 'level', 'warning',
          'message', 'Oppdraget er innenfor forbudsområde ' || COALESCE(v_aip_zone.zone_id, '') || ' (' || COALESCE(v_aip_zone.name, '') || '). Flyving ikke tillatt uten dispensasjon fra Luftfartstilsynet.'
        );
      ELSIF v_aip_zone.zone_type = 'R' THEN
        v_results := v_results || jsonb_build_object(
          'zone_type', 'AIP Restriksjonsområde',
          'zone_name', COALESCE(v_aip_zone.zone_id, '') || ' ' || COALESCE(v_aip_zone.name, ''),
          'distance_meters', 0, 'is_inside', true, 'level', 'warning',
          'message', 'Oppdraget er innenfor restriksjonsområde ' || COALESCE(v_aip_zone.zone_id, '') || ' (' || COALESCE(v_aip_zone.name, '') || '). Sjekk vilkår og innhent tillatelse.'
        );
      ELSE
        v_results := v_results || jsonb_build_object(
          'zone_type', 'AIP Fareområde',
          'zone_name', COALESCE(v_aip_zone.zone_id, '') || ' ' || COALESCE(v_aip_zone.name, ''),
          'distance_meters', 0, 'is_inside', true, 'level', 'caution',
          'message', 'Oppdraget er innenfor fareområde ' || COALESCE(v_aip_zone.zone_id, '') || ' (' || COALESCE(v_aip_zone.name, '') || '). Vurder aktivitetsstatus via NOTAM.'
        );
      END IF;
    ELSIF v_aip_zone_worst_distance IS NOT NULL AND v_aip_zone_worst_distance <= 5000 THEN
      v_results := v_results || jsonb_build_object(
        'zone_type', CASE v_aip_zone.zone_type WHEN 'P' THEN 'AIP Forbudsområde' WHEN 'R' THEN 'AIP Restriksjonsområde' ELSE 'AIP Fareområde' END,
        'zone_name', COALESCE(v_aip_zone.zone_id, '') || ' ' || COALESCE(v_aip_zone.name, ''),
        'distance_meters', ROUND(v_aip_zone_worst_distance::numeric), 'is_inside', false,
        'level', CASE WHEN v_aip_zone.zone_type IN ('P', 'R') THEN 'caution' ELSE 'note' END,
        'message', 'Nærmeste AIP ' || CASE v_aip_zone.zone_type WHEN 'P' THEN 'forbudsområde' WHEN 'R' THEN 'restriksjonsområde' ELSE 'fareområde' END || ' (' || COALESCE(v_aip_zone.zone_id, '') || ' ' || COALESCE(v_aip_zone.name, '') || ') er ' || ROUND(v_aip_zone_worst_distance::numeric) || ' m unna.'
      );
    END IF;
  END LOOP;

  -- Build results for non-AIP zones

  -- RPAS 5km zone result
  IF v_rpas5km_worst_inside THEN
    v_results := v_results || jsonb_build_object(
      'zone_type', 'RPAS 5km', 'zone_name', COALESCE(v_rpas5km_zone_name, 'lufthavn'),
      'distance_meters', 0, 'is_inside', true, 'level', 'warning',
      'message', 'Søk ATC om godkjenning. Ruten passerer gjennom RPAS 5 km sone ved ' || COALESCE(v_rpas5km_zone_name, 'lufthavn') || '.'
    );
  ELSIF v_rpas5km_worst_distance IS NOT NULL AND v_rpas5km_worst_distance <= 10000 THEN
    v_results := v_results || jsonb_build_object(
      'zone_type', 'RPAS 5km', 'zone_name', COALESCE(v_rpas5km_zone_name, 'lufthavn'),
      'distance_meters', ROUND(v_rpas5km_worst_distance::numeric), 'is_inside', false, 'level', 'note',
      'message', 'Nærmeste RPAS 5 km sone (' || COALESCE(v_rpas5km_zone_name, 'lufthavn') || ') er ' || ROUND(v_rpas5km_worst_distance::numeric) || ' m unna.'
    );
  END IF;

  -- CTR/TIZ result
  IF v_ctr_worst_inside THEN
    v_results := v_results || jsonb_build_object(
      'zone_type', COALESCE(v_ctr_zone_type, 'CTR/TIZ'), 'zone_name', COALESCE(v_ctr_zone_name, 'ukjent'),
      'distance_meters', 0, 'is_inside', true, 'level', 'warning',
      'message', 'Din flyging er planlagt under en ' || COALESCE(v_ctr_zone_type, 'CTR') || ' (' || COALESCE(v_ctr_zone_name, 'ukjent') || '). Pass på 120m høydebegrensning. Anbefalt å ta kontakt med ATC.'
    );
  ELSIF v_ctr_worst_distance IS NOT NULL AND v_ctr_worst_distance <= 3000 THEN
    v_results := v_results || jsonb_build_object(
      'zone_type', COALESCE(v_ctr_zone_type, 'CTR/TIZ'), 'zone_name', COALESCE(v_ctr_zone_name, 'ukjent'),
      'distance_meters', ROUND(v_ctr_worst_distance::numeric), 'is_inside', false, 'level', 'caution',
      'message', 'Din flyging er planlagt nært en ' || COALESCE(v_ctr_zone_type, 'CTR') || ' (' || COALESCE(v_ctr_zone_name, 'ukjent') || '). Avstand: ' || ROUND(v_ctr_worst_distance::numeric) || ' m.'
    );
  ELSIF v_ctr_worst_distance IS NOT NULL AND v_ctr_worst_distance <= 10000 THEN
    v_results := v_results || jsonb_build_object(
      'zone_type', COALESCE(v_ctr_zone_type, 'CTR/TIZ'), 'zone_name', COALESCE(v_ctr_zone_name, 'ukjent'),
      'distance_meters', ROUND(v_ctr_worst_distance::numeric), 'is_inside', false, 'level', 'note',
      'message', 'Nærmeste ' || COALESCE(v_ctr_zone_type, 'CTR') || ' (' || COALESCE(v_ctr_zone_name, 'ukjent') || ') er ' || ROUND(v_ctr_worst_distance::numeric) || ' m unna.'
    );
  END IF;

  -- NSM result
  IF v_nsm_worst_inside THEN
    v_results := v_results || jsonb_build_object(
      'zone_type', 'NSM', 'zone_name', COALESCE(v_nsm_zone_name, 'NSM-sone'),
      'distance_meters', 0, 'is_inside', true, 'level', 'warning',
      'message', 'Oppdraget er innenfor NSM forbudsområde (' || COALESCE(v_nsm_zone_name, 'NSM-sone') || '). Søk dispensasjon hos NSM før flyving.'
    );
  ELSIF v_nsm_worst_distance IS NOT NULL AND v_nsm_worst_distance <= 3000 THEN
    v_results := v_results || jsonb_build_object(
      'zone_type', 'NSM', 'zone_name', COALESCE(v_nsm_zone_name, 'NSM-sone'),
      'distance_meters', ROUND(v_nsm_worst_distance::numeric), 'is_inside', false, 'level', 'caution',
      'message', 'Din flyging er planlagt nært et NSM forbudsområde (' || COALESCE(v_nsm_zone_name, 'NSM-sone') || '). Avstand: ' || ROUND(v_nsm_worst_distance::numeric) || ' m.'
    );
  ELSIF v_nsm_worst_distance IS NOT NULL AND v_nsm_worst_distance <= 10000 THEN
    v_results := v_results || jsonb_build_object(
      'zone_type', 'NSM', 'zone_name', COALESCE(v_nsm_zone_name, 'NSM-sone'),
      'distance_meters', ROUND(v_nsm_worst_distance::numeric), 'is_inside', false, 'level', 'note',
      'message', 'Nærmeste NSM forbudsområde (' || COALESCE(v_nsm_zone_name, 'NSM-sone') || ') er ' || ROUND(v_nsm_worst_distance::numeric) || ' m unna.'
    );
  END IF;

  RETURN v_results;
END;
$$;
