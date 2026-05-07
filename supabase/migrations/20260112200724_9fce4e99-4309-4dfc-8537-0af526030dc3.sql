-- Drop the existing format check constraint
ALTER TABLE incident_eccairs_attributes 
DROP CONSTRAINT IF EXISTS incident_eccairs_attributes_format_check;

-- Add updated constraint with utc_date
ALTER TABLE incident_eccairs_attributes 
ADD CONSTRAINT incident_eccairs_attributes_format_check 
CHECK (
  format IS NULL OR format = ANY (ARRAY[
    'value_list_int_array'::text,
    'text_content_array'::text, 
    'string_array'::text,
    'content_object_array'::text,
    'raw_json'::text,
    'local_date'::text,
    'local_time'::text,
    'utc_date'::text
  ])
);