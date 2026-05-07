-- Refresh planner statistics for airspace tables
ANALYZE aip_restriction_zones;
ANALYZE nsm_restriction_zones;
ANALYZE rpas_5km_zones;

-- Create geography-casted GIST indexes for ST_DWithin performance
CREATE INDEX IF NOT EXISTS idx_aip_zones_geog ON aip_restriction_zones USING gist ((geometry::geography));
CREATE INDEX IF NOT EXISTS idx_nsm_zones_geog ON nsm_restriction_zones USING gist ((geometry::geography));
CREATE INDEX IF NOT EXISTS idx_rpas_5km_zones_geog ON rpas_5km_zones USING gist ((geometry::geography));