-- Enable PostGIS extension
CREATE EXTENSION IF NOT EXISTS postgis;

-- Create rpas_ctr_tiz table (Kontrollsoner)
CREATE TABLE rpas_ctr_tiz (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  external_id text UNIQUE,
  name text,
  description text,
  geometry geometry(Geometry, 4326) NOT NULL,
  properties jsonb,
  synced_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX idx_rpas_ctr_tiz_geometry ON rpas_ctr_tiz USING GIST (geometry);

-- Create nsm_restriction_zones table (NSM Forbudsområder)
CREATE TABLE nsm_restriction_zones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  external_id text UNIQUE,
  name text,
  description text,
  geometry geometry(Geometry, 4326) NOT NULL,
  properties jsonb,
  synced_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX idx_nsm_restriction_zones_geometry ON nsm_restriction_zones USING GIST (geometry);

-- Create rpas_5km_zones table (RPAS 5km soner)
CREATE TABLE rpas_5km_zones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  external_id text UNIQUE,
  name text,
  description text,
  geometry geometry(Geometry, 4326) NOT NULL,
  properties jsonb,
  synced_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX idx_rpas_5km_zones_geometry ON rpas_5km_zones USING GIST (geometry);

-- Function to upsert GeoJSON features
CREATE OR REPLACE FUNCTION upsert_geojson_feature(
  p_table_name text,
  p_external_id text,
  p_name text,
  p_description text,
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
  
  EXECUTE format(
    'INSERT INTO %I (external_id, name, description, geometry, properties, synced_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, now(), now())
     ON CONFLICT (external_id) 
     DO UPDATE SET 
       name = EXCLUDED.name,
       description = EXCLUDED.description,
       geometry = EXCLUDED.geometry,
       properties = EXCLUDED.properties,
       synced_at = now(),
       updated_at = now()
     RETURNING id',
    p_table_name
  )
  INTO v_id
  USING p_external_id, p_name, p_description, v_geometry, p_properties;
  
  RETURN v_id;
END;
$$;

-- Function to check mission zone conflicts
CREATE OR REPLACE FUNCTION check_mission_zone_conflicts(
  p_latitude double precision,
  p_longitude double precision
)
RETURNS TABLE (
  zone_type text,
  zone_name text,
  zone_id uuid,
  distance_meters double precision,
  is_inside boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH point AS (
    SELECT ST_SetSRID(ST_MakePoint(p_longitude, p_latitude), 4326)::geography AS geog
  )
  SELECT 
    'CTR/TIZ' as zone_type,
    r.name as zone_name,
    r.id as zone_id,
    ST_Distance(point.geog, r.geometry::geography) as distance_meters,
    ST_Contains(r.geometry, ST_SetSRID(ST_MakePoint(p_longitude, p_latitude), 4326)) as is_inside
  FROM rpas_ctr_tiz r, point
  WHERE ST_DWithin(r.geometry::geography, point.geog, 10000)
  
  UNION ALL
  
  SELECT 
    'NSM Forbudsområde' as zone_type,
    n.name as zone_name,
    n.id as zone_id,
    ST_Distance(point.geog, n.geometry::geography) as distance_meters,
    ST_Contains(n.geometry, ST_SetSRID(ST_MakePoint(p_longitude, p_latitude), 4326)) as is_inside
  FROM nsm_restriction_zones n, point
  WHERE ST_DWithin(n.geometry::geography, point.geog, 10000)
  
  UNION ALL
  
  SELECT 
    'RPAS 5km sone' as zone_type,
    z.name as zone_name,
    z.id as zone_id,
    ST_Distance(point.geog, z.geometry::geography) as distance_meters,
    ST_Contains(z.geometry, ST_SetSRID(ST_MakePoint(p_longitude, p_latitude), 4326)) as is_inside
  FROM rpas_5km_zones z, point
  WHERE ST_DWithin(z.geometry::geography, point.geog, 10000)
  
  ORDER BY distance_meters ASC;
$$;

-- Enable RLS
ALTER TABLE rpas_ctr_tiz ENABLE ROW LEVEL SECURITY;
ALTER TABLE nsm_restriction_zones ENABLE ROW LEVEL SECURITY;
ALTER TABLE rpas_5km_zones ENABLE ROW LEVEL SECURITY;

-- RLS policies for authenticated users to read
CREATE POLICY "Authenticated users can view CTR/TIZ zones" ON rpas_ctr_tiz
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can view NSM zones" ON nsm_restriction_zones
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can view RPAS 5km zones" ON rpas_5km_zones
  FOR SELECT USING (auth.role() = 'authenticated');