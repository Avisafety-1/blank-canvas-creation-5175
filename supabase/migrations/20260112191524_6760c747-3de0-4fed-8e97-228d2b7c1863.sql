-- Oppdater eksisterende attributt 390 rader til å ha entity_path = '14' (Events entity)
UPDATE incident_eccairs_attributes 
SET entity_path = '14', updated_at = now()
WHERE attribute_code = 390 AND (entity_path IS NULL OR entity_path = '');

-- Oppdater eksisterende attributt 32 rader til å ha entity_path = '4' (Aircraft entity)
UPDATE incident_eccairs_attributes 
SET entity_path = '4', updated_at = now()
WHERE attribute_code = 32 AND (entity_path IS NULL OR entity_path = '');