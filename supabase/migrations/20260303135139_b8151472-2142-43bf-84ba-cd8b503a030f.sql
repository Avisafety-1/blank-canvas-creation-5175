UPDATE aip_restriction_zones
SET zone_type = 'CTR'
WHERE zone_type = 'R' AND name ILIKE '%CTR%';