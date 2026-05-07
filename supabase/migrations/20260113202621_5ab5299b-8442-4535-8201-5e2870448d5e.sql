-- Fix entity_path for attributes 432 and 448 to be top-level (null)
-- These attributes belong to Entity 24 (Occurrence), not Entity 4 (Aircraft)

UPDATE incident_eccairs_attributes
SET entity_path = NULL, updated_at = now()
WHERE taxonomy_code = '24'
  AND attribute_code IN (432, 448)
  AND entity_path IS NOT NULL;