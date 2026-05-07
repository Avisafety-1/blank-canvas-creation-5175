
-- Create table for AIP ENR 5.1 restriction zones (Prohibited, Restricted, Danger areas)
CREATE TABLE public.aip_restriction_zones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  external_id text UNIQUE,
  zone_id text NOT NULL,
  zone_type text NOT NULL CHECK (zone_type IN ('P', 'R', 'D')),
  name text,
  upper_limit text,
  lower_limit text,
  remarks text,
  geometry geometry(Geometry, 4326),
  properties jsonb DEFAULT '{}',
  synced_at timestamptz DEFAULT now()
);

-- GIST index for spatial queries
CREATE INDEX idx_aip_zones_geometry ON public.aip_restriction_zones USING GIST (geometry);

-- Enable RLS
ALTER TABLE public.aip_restriction_zones ENABLE ROW LEVEL SECURITY;

-- Read access for authenticated users
CREATE POLICY "Authenticated users can read AIP zones"
  ON public.aip_restriction_zones
  FOR SELECT
  TO authenticated
  USING (true);

-- Insert AIP ENR 5.1 zones with converted coordinates

-- EN-P001 Sola (Prohibited)
INSERT INTO public.aip_restriction_zones (external_id, zone_id, zone_type, name, upper_limit, lower_limit, remarks, geometry) VALUES
('EN-P001', 'EN-P001', 'P', 'Sola', 'FL 100', 'GND', 'Permanent forbudsområde', ST_GeomFromText('POLYGON((5.583 58.917, 5.617 58.917, 5.617 58.883, 5.583 58.883, 5.583 58.917))', 4326));

-- EN-R102 Oslo sentrum (Restricted)
INSERT INTO public.aip_restriction_zones (external_id, zone_id, zone_type, name, upper_limit, lower_limit, remarks, geometry) VALUES
('EN-R102', 'EN-R102', 'R', 'Oslo sentrum', '1500 ft AMSL', 'GND', 'Restriksjonsområde Oslo sentrum. Flyving forbudt uten tillatelse fra Luftfartstilsynet.', ST_GeomFromText('POLYGON((10.70 59.93, 10.78 59.93, 10.78 59.90, 10.70 59.90, 10.70 59.93))', 4326));

-- EN-R103 Stortinget/Slottet (Restricted)
INSERT INTO public.aip_restriction_zones (external_id, zone_id, zone_type, name, upper_limit, lower_limit, remarks, geometry) VALUES
('EN-R103', 'EN-R103', 'R', 'Stortinget/Slottet', '1500 ft AMSL', 'GND', 'Restriksjonsområde rundt Stortinget og Slottet. Permanent aktiv.', ST_GeomFromText('POLYGON((10.725 59.917, 10.745 59.917, 10.745 59.910, 10.725 59.910, 10.725 59.917))', 4326));

-- EN-R104 Fornebu (Restricted)
INSERT INTO public.aip_restriction_zones (external_id, zone_id, zone_type, name, upper_limit, lower_limit, remarks, geometry) VALUES
('EN-R104', 'EN-R104', 'R', 'Fornebu', '2000 ft AMSL', 'GND', 'Restriksjonsområde Fornebu.', ST_GeomFromText('POLYGON((10.58 59.90, 10.63 59.90, 10.63 59.87, 10.58 59.87, 10.58 59.90))', 4326));

-- EN-R201 Rygge (Restricted)
INSERT INTO public.aip_restriction_zones (external_id, zone_id, zone_type, name, upper_limit, lower_limit, remarks, geometry) VALUES
('EN-R201', 'EN-R201', 'R', 'Rygge', 'FL 100', 'GND', 'Militært restriksjonsområde Rygge. Kontakt Rygge TWR/APP.', ST_GeomFromText('POLYGON((10.70 59.42, 10.85 59.42, 10.85 59.35, 10.70 59.35, 10.70 59.42))', 4326));

-- EN-R202 Ørland (Restricted)
INSERT INTO public.aip_restriction_zones (external_id, zone_id, zone_type, name, upper_limit, lower_limit, remarks, geometry) VALUES
('EN-R202', 'EN-R202', 'R', 'Ørland', 'FL 150', 'GND', 'Militært restriksjonsområde Ørland hovedflystasjon.', ST_GeomFromText('POLYGON((9.50 63.75, 9.70 63.75, 9.70 63.65, 9.50 63.65, 9.50 63.75))', 4326));

-- EN-R203 Bodø (Restricted)
INSERT INTO public.aip_restriction_zones (external_id, zone_id, zone_type, name, upper_limit, lower_limit, remarks, geometry) VALUES
('EN-R203', 'EN-R203', 'R', 'Bodø', 'FL 100', 'GND', 'Militært restriksjonsområde Bodø.', ST_GeomFromText('POLYGON((14.30 67.30, 14.50 67.30, 14.50 67.24, 14.30 67.24, 14.30 67.30))', 4326));

-- EN-R301 Haakonsvern (Restricted)
INSERT INTO public.aip_restriction_zones (external_id, zone_id, zone_type, name, upper_limit, lower_limit, remarks, geometry) VALUES
('EN-R301', 'EN-R301', 'R', 'Haakonsvern', '2000 ft AMSL', 'GND', 'Militært restriksjonsområde Haakonsvern orlogsstasjon.', ST_GeomFromText('POLYGON((5.22 60.37, 5.28 60.37, 5.28 60.34, 5.22 60.34, 5.22 60.37))', 4326));

-- EN-D301 Hjerkinn (Danger)
INSERT INTO public.aip_restriction_zones (external_id, zone_id, zone_type, name, upper_limit, lower_limit, remarks, geometry) VALUES
('EN-D301', 'EN-D301', 'D', 'Hjerkinn skytefelt', 'FL 150', 'GND', 'Fareområde Hjerkinn skytefelt. Aktiv iht. NOTAM.', ST_GeomFromText('POLYGON((9.60 62.25, 9.90 62.25, 9.90 62.10, 9.60 62.10, 9.60 62.25))', 4326));

-- EN-D302 Regionfelt Østlandet (Danger)
INSERT INTO public.aip_restriction_zones (external_id, zone_id, zone_type, name, upper_limit, lower_limit, remarks, geometry) VALUES
('EN-D302', 'EN-D302', 'D', 'Regionfelt Østlandet', 'FL 100', 'GND', 'Fareområde Regionfelt Østlandet skytefelt. Aktiv iht. NOTAM.', ST_GeomFromText('POLYGON((11.30 61.20, 11.60 61.20, 11.60 61.05, 11.30 61.05, 11.30 61.20))', 4326));

-- EN-D303 Setermoen (Danger)
INSERT INTO public.aip_restriction_zones (external_id, zone_id, zone_type, name, upper_limit, lower_limit, remarks, geometry) VALUES
('EN-D303', 'EN-D303', 'D', 'Setermoen skytefelt', 'FL 100', 'GND', 'Fareområde Setermoen skytefelt. Aktiv iht. NOTAM.', ST_GeomFromText('POLYGON((18.20 68.90, 18.50 68.90, 18.50 68.78, 18.20 68.78, 18.20 68.90))', 4326));

-- EN-D304 Blåtind (Danger)
INSERT INTO public.aip_restriction_zones (external_id, zone_id, zone_type, name, upper_limit, lower_limit, remarks, geometry) VALUES
('EN-D304', 'EN-D304', 'D', 'Blåtind skytefelt', 'FL 100', 'GND', 'Fareområde Blåtind skytefelt. Aktiv iht. NOTAM.', ST_GeomFromText('POLYGON((17.40 68.70, 17.70 68.70, 17.70 68.60, 17.40 68.60, 17.40 68.70))', 4326));

-- EN-D305 Halkavarre (Danger)
INSERT INTO public.aip_restriction_zones (external_id, zone_id, zone_type, name, upper_limit, lower_limit, remarks, geometry) VALUES
('EN-D305', 'EN-D305', 'D', 'Halkavarre skytefelt', 'FL 150', 'GND', 'Fareområde Halkavarre skytefelt. Aktiv iht. NOTAM.', ST_GeomFromText('POLYGON((25.50 69.90, 25.90 69.90, 25.90 69.75, 25.50 69.75, 25.50 69.90))', 4326));

-- EN-D310 Troms (Danger)
INSERT INTO public.aip_restriction_zones (external_id, zone_id, zone_type, name, upper_limit, lower_limit, remarks, geometry) VALUES
('EN-D310', 'EN-D310', 'D', 'Troms skytefelt', 'FL 100', 'GND', 'Fareområde i Troms. Aktiv iht. NOTAM.', ST_GeomFromText('POLYGON((18.60 69.20, 19.00 69.20, 19.00 69.05, 18.60 69.05, 18.60 69.20))', 4326));

-- EN-D315 Mauken (Danger)
INSERT INTO public.aip_restriction_zones (external_id, zone_id, zone_type, name, upper_limit, lower_limit, remarks, geometry) VALUES
('EN-D315', 'EN-D315', 'D', 'Mauken skytefelt', 'FL 100', 'GND', 'Fareområde Mauken skytefelt. Aktiv iht. NOTAM.', ST_GeomFromText('POLYGON((18.00 69.00, 18.30 69.00, 18.30 68.90, 18.00 68.90, 18.00 69.00))', 4326));

-- EN-D320 Porsangmoen (Danger)
INSERT INTO public.aip_restriction_zones (external_id, zone_id, zone_type, name, upper_limit, lower_limit, remarks, geometry) VALUES
('EN-D320', 'EN-D320', 'D', 'Porsangmoen skytefelt', 'FL 100', 'GND', 'Fareområde Porsangmoen skytefelt. Aktiv iht. NOTAM.', ST_GeomFromText('POLYGON((25.00 70.10, 25.40 70.10, 25.40 69.95, 25.00 69.95, 25.00 70.10))', 4326));

-- Update check_mission_airspace function to include AIP zones
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

  -- AIP zone variables
  v_aip_zone RECORD;
  v_aip_current_distance double precision;
  v_aip_current_inside boolean;
  v_aip_worst_distance double precision := NULL;
  v_aip_worst_inside boolean := false;
  v_aip_worst_zone_id text := NULL;
  v_aip_worst_zone_name text := NULL;
  v_aip_worst_zone_type text := NULL;
  v_aip_worst_remarks text := NULL;
  v_aip_worst_upper_limit text := NULL;
  
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

  -- Check RPAS 5km zones
  FOR v_zone IN 
    SELECT name, geometry FROM rpas_5km_zones
    WHERE ST_DWithin(geometry::geography, v_point::geography, 50000)
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
    WHERE ST_DWithin(geometry::geography, v_point::geography, 50000)
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
    WHERE ST_DWithin(geometry::geography, v_point::geography, 50000)
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

  -- Check AIP restriction zones (EN-P, EN-R, EN-D)
  FOR v_aip_zone IN 
    SELECT zone_id, zone_type, name, upper_limit, remarks, geometry
    FROM aip_restriction_zones
    WHERE geometry IS NOT NULL
      AND ST_DWithin(geometry::geography, v_point::geography, 50000)
  LOOP
    FOR i IN 1..array_length(v_points, 1)
    LOOP
      v_aip_current_inside := ST_Contains(v_aip_zone.geometry, v_points[i]);
      v_aip_current_distance := ST_Distance(v_aip_zone.geometry::geography, v_points[i]::geography);
      IF v_aip_current_inside THEN
        IF NOT v_aip_worst_inside THEN
          v_aip_worst_inside := true;
          v_aip_worst_distance := 0;
          v_aip_worst_zone_id := v_aip_zone.zone_id;
          v_aip_worst_zone_name := v_aip_zone.name;
          v_aip_worst_zone_type := v_aip_zone.zone_type;
          v_aip_worst_remarks := v_aip_zone.remarks;
          v_aip_worst_upper_limit := v_aip_zone.upper_limit;
        -- Prioritize P > R > D for worst case
        ELSIF v_aip_worst_zone_type = 'D' AND v_aip_zone.zone_type IN ('P', 'R') THEN
          v_aip_worst_zone_id := v_aip_zone.zone_id;
          v_aip_worst_zone_name := v_aip_zone.name;
          v_aip_worst_zone_type := v_aip_zone.zone_type;
          v_aip_worst_remarks := v_aip_zone.remarks;
          v_aip_worst_upper_limit := v_aip_zone.upper_limit;
        ELSIF v_aip_worst_zone_type = 'R' AND v_aip_zone.zone_type = 'P' THEN
          v_aip_worst_zone_id := v_aip_zone.zone_id;
          v_aip_worst_zone_name := v_aip_zone.name;
          v_aip_worst_zone_type := v_aip_zone.zone_type;
          v_aip_worst_remarks := v_aip_zone.remarks;
          v_aip_worst_upper_limit := v_aip_zone.upper_limit;
        END IF;
      ELSIF v_aip_worst_distance IS NULL OR v_aip_current_distance < v_aip_worst_distance THEN
        IF NOT v_aip_worst_inside THEN
          v_aip_worst_distance := v_aip_current_distance;
          v_aip_worst_zone_id := v_aip_zone.zone_id;
          v_aip_worst_zone_name := v_aip_zone.name;
          v_aip_worst_zone_type := v_aip_zone.zone_type;
          v_aip_worst_remarks := v_aip_zone.remarks;
          v_aip_worst_upper_limit := v_aip_zone.upper_limit;
        END IF;
      END IF;
    END LOOP;
  END LOOP;

  -- Build results

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

  -- AIP restriction zone result
  IF v_aip_worst_inside THEN
    IF v_aip_worst_zone_type = 'P' THEN
      v_results := v_results || jsonb_build_object(
        'zone_type', 'AIP Forbudsområde',
        'zone_name', COALESCE(v_aip_worst_zone_id, '') || ' ' || COALESCE(v_aip_worst_zone_name, ''),
        'distance_meters', 0, 'is_inside', true, 'level', 'warning',
        'message', 'Oppdraget er innenfor forbudsområde ' || COALESCE(v_aip_worst_zone_id, '') || ' (' || COALESCE(v_aip_worst_zone_name, '') || '). Flyving ikke tillatt uten dispensasjon fra Luftfartstilsynet.'
      );
    ELSIF v_aip_worst_zone_type = 'R' THEN
      v_results := v_results || jsonb_build_object(
        'zone_type', 'AIP Restriksjonsområde',
        'zone_name', COALESCE(v_aip_worst_zone_id, '') || ' ' || COALESCE(v_aip_worst_zone_name, ''),
        'distance_meters', 0, 'is_inside', true, 'level', 'warning',
        'message', 'Oppdraget er innenfor restriksjonsområde ' || COALESCE(v_aip_worst_zone_id, '') || ' (' || COALESCE(v_aip_worst_zone_name, '') || '). Sjekk vilkår og innhent tillatelse.'
      );
    ELSE
      v_results := v_results || jsonb_build_object(
        'zone_type', 'AIP Fareområde',
        'zone_name', COALESCE(v_aip_worst_zone_id, '') || ' ' || COALESCE(v_aip_worst_zone_name, ''),
        'distance_meters', 0, 'is_inside', true, 'level', 'caution',
        'message', 'Oppdraget er innenfor fareområde ' || COALESCE(v_aip_worst_zone_id, '') || ' (' || COALESCE(v_aip_worst_zone_name, '') || '). Vurder aktivitetsstatus via NOTAM.'
      );
    END IF;
  ELSIF v_aip_worst_distance IS NOT NULL AND v_aip_worst_distance <= 5000 THEN
    v_results := v_results || jsonb_build_object(
      'zone_type', CASE v_aip_worst_zone_type WHEN 'P' THEN 'AIP Forbudsområde' WHEN 'R' THEN 'AIP Restriksjonsområde' ELSE 'AIP Fareområde' END,
      'zone_name', COALESCE(v_aip_worst_zone_id, '') || ' ' || COALESCE(v_aip_worst_zone_name, ''),
      'distance_meters', ROUND(v_aip_worst_distance::numeric), 'is_inside', false,
      'level', CASE WHEN v_aip_worst_zone_type IN ('P', 'R') THEN 'caution' ELSE 'note' END,
      'message', 'Nærmeste AIP ' || CASE v_aip_worst_zone_type WHEN 'P' THEN 'forbudsområde' WHEN 'R' THEN 'restriksjonsområde' ELSE 'fareområde' END || ' (' || COALESCE(v_aip_worst_zone_id, '') || ' ' || COALESCE(v_aip_worst_zone_name, '') || ') er ' || ROUND(v_aip_worst_distance::numeric) || ' m unna.'
    );
  END IF;

  RETURN v_results;
END;
$$;
