-- Create function to check mission airspace conflicts and distances
CREATE OR REPLACE FUNCTION check_mission_airspace(
  p_lat double precision,
  p_lon double precision
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_point geometry;
  v_point_geog geography;
  v_result jsonb := '[]'::jsonb;
  v_warning jsonb;
  v_zone RECORD;
BEGIN
  -- Construct point from coordinates
  v_point := ST_SetSRID(ST_MakePoint(p_lon, p_lat), 4326);
  v_point_geog := v_point::geography;
  
  -- Check CTR/TIZ zones
  FOR v_zone IN 
    SELECT 
      name,
      ST_Distance(geometry::geography, v_point_geog) as distance,
      ST_Intersects(geometry, v_point) as is_inside
    FROM rpas_ctr_tiz
    WHERE ST_DWithin(geometry::geography, v_point_geog, 10000)
    ORDER BY ST_Distance(geometry::geography, v_point_geog)
    LIMIT 3
  LOOP
    v_warning := jsonb_build_object(
      'zone_type', 'CTR/TIZ',
      'zone_name', v_zone.name,
      'distance_meters', ROUND(v_zone.distance::numeric),
      'is_inside', v_zone.is_inside,
      'level', CASE 
        WHEN v_zone.is_inside THEN 'warning'
        WHEN v_zone.distance <= 3000 THEN 'caution'
        ELSE 'note'
      END,
      'message', CASE 
        WHEN v_zone.is_inside THEN 'Oppdraget er innenfor kontrollert luftrom (' || COALESCE(v_zone.name, 'CTR/TIZ') || '). Kontakt ATC for klarering.'
        WHEN v_zone.distance <= 3000 THEN 'Oppdraget er ' || ROUND(v_zone.distance::numeric) || ' m fra kontrollert luftrom (' || COALESCE(v_zone.name, 'CTR/TIZ') || '). Vær oppmerksom på luftromsbegrensninger.'
        ELSE 'Nærmeste kontrollerte luftrom (' || COALESCE(v_zone.name, 'CTR/TIZ') || ') er ' || ROUND(v_zone.distance::numeric) || ' m unna.'
      END
    );
    v_result := v_result || v_warning;
  END LOOP;
  
  -- Check NSM restriction zones
  FOR v_zone IN 
    SELECT 
      name,
      ST_Distance(geometry::geography, v_point_geog) as distance,
      ST_Intersects(geometry, v_point) as is_inside
    FROM nsm_restriction_zones
    WHERE ST_DWithin(geometry::geography, v_point_geog, 10000)
    ORDER BY ST_Distance(geometry::geography, v_point_geog)
    LIMIT 3
  LOOP
    v_warning := jsonb_build_object(
      'zone_type', 'NSM',
      'zone_name', v_zone.name,
      'distance_meters', ROUND(v_zone.distance::numeric),
      'is_inside', v_zone.is_inside,
      'level', CASE 
        WHEN v_zone.is_inside THEN 'warning'
        WHEN v_zone.distance <= 3000 THEN 'caution'
        ELSE 'note'
      END,
      'message', CASE 
        WHEN v_zone.is_inside THEN 'Oppdraget er innenfor NSM forbudsområde (' || COALESCE(v_zone.name, 'NSM-sone') || '). Søk dispensasjon hos NSM før flyving.'
        WHEN v_zone.distance <= 3000 THEN 'Oppdraget er ' || ROUND(v_zone.distance::numeric) || ' m fra NSM forbudsområde (' || COALESCE(v_zone.name, 'NSM-sone') || '). Vær oppmerksom på restriksjoner.'
        ELSE 'Nærmeste NSM forbudsområde (' || COALESCE(v_zone.name, 'NSM-sone') || ') er ' || ROUND(v_zone.distance::numeric) || ' m unna.'
      END
    );
    v_result := v_result || v_warning;
  END LOOP;
  
  -- Check RPAS 5km zones
  FOR v_zone IN 
    SELECT 
      name,
      ST_Distance(geometry::geography, v_point_geog) as distance,
      ST_Intersects(geometry, v_point) as is_inside
    FROM rpas_5km_zones
    WHERE ST_DWithin(geometry::geography, v_point_geog, 10000)
    ORDER BY ST_Distance(geometry::geography, v_point_geog)
    LIMIT 3
  LOOP
    v_warning := jsonb_build_object(
      'zone_type', 'RPAS 5km',
      'zone_name', v_zone.name,
      'distance_meters', ROUND(v_zone.distance::numeric),
      'is_inside', v_zone.is_inside,
      'level', CASE 
        WHEN v_zone.is_inside THEN 'warning'
        WHEN v_zone.distance <= 3000 THEN 'caution'
        ELSE 'note'
      END,
      'message', CASE 
        WHEN v_zone.is_inside THEN 'Oppdraget er innenfor RPAS 5 km sone (' || COALESCE(v_zone.name, 'lufthavn') || '). Søk tillatelse hos Avinor/Avidrone før flyving.'
        WHEN v_zone.distance <= 3000 THEN 'Oppdraget er ' || ROUND(v_zone.distance::numeric) || ' m fra RPAS 5 km sone (' || COALESCE(v_zone.name, 'lufthavn') || '). Vær oppmerksom.'
        ELSE 'Nærmeste RPAS 5 km sone (' || COALESCE(v_zone.name, 'lufthavn') || ') er ' || ROUND(v_zone.distance::numeric) || ' m unna.'
      END
    );
    v_result := v_result || v_warning;
  END LOOP;
  
  RETURN v_result;
END;
$$;