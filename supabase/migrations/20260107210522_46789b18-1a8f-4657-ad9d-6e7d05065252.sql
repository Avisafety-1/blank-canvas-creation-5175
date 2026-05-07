-- Add taxonomy_code, format, and payload_json columns to incident_eccairs_attributes
ALTER TABLE public.incident_eccairs_attributes 
ADD COLUMN IF NOT EXISTS taxonomy_code text DEFAULT '24',
ADD COLUMN IF NOT EXISTS format text,
ADD COLUMN IF NOT EXISTS payload_json jsonb;

-- Add CHECK constraint on format
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'incident_eccairs_attributes_format_check'
  ) THEN
    ALTER TABLE public.incident_eccairs_attributes
    ADD CONSTRAINT incident_eccairs_attributes_format_check 
    CHECK (format IS NULL OR format IN ('value_list_int_array', 'text_content_array', 'raw_json'));
  END IF;
END $$;

-- Comments for documentation
COMMENT ON COLUMN incident_eccairs_attributes.taxonomy_code IS 
  'E2 taxonomy code, default "24" (Occurrence). Other examples: "25" (Aircraft)';
COMMENT ON COLUMN incident_eccairs_attributes.format IS 
  'Payload format: value_list_int_array | text_content_array | raw_json';
COMMENT ON COLUMN incident_eccairs_attributes.payload_json IS 
  'Direct E2 payload override for special attribute structures';

-- Drop existing unique constraint and create new one that includes taxonomy_code
ALTER TABLE public.incident_eccairs_attributes 
DROP CONSTRAINT IF EXISTS incident_eccairs_attributes_incident_id_attribute_code_key;

ALTER TABLE public.incident_eccairs_attributes 
ADD CONSTRAINT incident_eccairs_attributes_unique 
UNIQUE (incident_id, attribute_code, taxonomy_code);

-- Migrate existing data from wide table to generic table
-- occurrence_class → attribute_code 431
INSERT INTO incident_eccairs_attributes 
  (incident_id, attribute_code, value_id, taxonomy_code, format, source)
SELECT 
  incident_id, 
  431, 
  occurrence_class, 
  '24', 
  'value_list_int_array', 
  'migrated'
FROM incident_eccairs_mappings 
WHERE occurrence_class IS NOT NULL
ON CONFLICT (incident_id, attribute_code, taxonomy_code) 
DO UPDATE SET 
  value_id = EXCLUDED.value_id, 
  format = EXCLUDED.format,
  updated_at = now();

-- phase_of_flight → attribute_code 1072
INSERT INTO incident_eccairs_attributes 
  (incident_id, attribute_code, value_id, taxonomy_code, format, source)
SELECT 
  incident_id, 
  1072, 
  phase_of_flight, 
  '24', 
  'value_list_int_array', 
  'migrated'
FROM incident_eccairs_mappings 
WHERE phase_of_flight IS NOT NULL
ON CONFLICT (incident_id, attribute_code, taxonomy_code) 
DO UPDATE SET 
  value_id = EXCLUDED.value_id, 
  format = EXCLUDED.format,
  updated_at = now();

-- aircraft_category → attribute_code 17
INSERT INTO incident_eccairs_attributes 
  (incident_id, attribute_code, value_id, taxonomy_code, format, source)
SELECT 
  incident_id, 
  17, 
  aircraft_category, 
  '24', 
  'value_list_int_array', 
  'migrated'
FROM incident_eccairs_mappings 
WHERE aircraft_category IS NOT NULL
ON CONFLICT (incident_id, attribute_code, taxonomy_code) 
DO UPDATE SET 
  value_id = EXCLUDED.value_id, 
  format = EXCLUDED.format,
  updated_at = now();

-- headline → attribute_code 390
INSERT INTO incident_eccairs_attributes 
  (incident_id, attribute_code, text_value, taxonomy_code, format, source)
SELECT 
  incident_id, 
  390, 
  headline, 
  '24', 
  'text_content_array', 
  'migrated'
FROM incident_eccairs_mappings 
WHERE headline IS NOT NULL AND headline != ''
ON CONFLICT (incident_id, attribute_code, taxonomy_code) 
DO UPDATE SET 
  text_value = EXCLUDED.text_value, 
  format = EXCLUDED.format,
  updated_at = now();

-- narrative → attribute_code 391
INSERT INTO incident_eccairs_attributes 
  (incident_id, attribute_code, text_value, taxonomy_code, format, source)
SELECT 
  incident_id, 
  391, 
  narrative, 
  '24', 
  'text_content_array', 
  'migrated'
FROM incident_eccairs_mappings 
WHERE narrative IS NOT NULL AND narrative != ''
ON CONFLICT (incident_id, attribute_code, taxonomy_code) 
DO UPDATE SET 
  text_value = EXCLUDED.text_value, 
  format = EXCLUDED.format,
  updated_at = now();

-- Refresh PostgREST schema cache
NOTIFY pgrst, 'reload schema';