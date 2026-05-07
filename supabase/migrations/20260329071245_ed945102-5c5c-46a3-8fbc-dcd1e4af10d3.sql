INSERT INTO eccairs.value_list_items (value_list_key, value_id, value_synonym, value_description)
SELECT 'VL1091', value_id, value_synonym, value_description
FROM eccairs.value_list_items
WHERE value_list_key = 'VL424' AND value_id IS NOT NULL
ON CONFLICT DO NOTHING;