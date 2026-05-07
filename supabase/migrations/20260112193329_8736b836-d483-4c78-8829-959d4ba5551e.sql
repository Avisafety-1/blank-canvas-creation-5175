-- Oppdater eksisterende attributt 454 rader til å ha riktig format (content_object_array)
UPDATE incident_eccairs_attributes 
SET format = 'content_object_array', updated_at = now()
WHERE attribute_code = 454 AND format = 'value_list_int_array';