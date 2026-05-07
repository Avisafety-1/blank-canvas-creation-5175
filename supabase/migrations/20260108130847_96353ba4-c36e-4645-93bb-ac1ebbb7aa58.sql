-- Drop the existing constraint
ALTER TABLE incident_eccairs_attributes 
DROP CONSTRAINT IF EXISTS incident_eccairs_attributes_format_check;

-- Add the updated constraint with timestamp_utc included
ALTER TABLE incident_eccairs_attributes 
ADD CONSTRAINT incident_eccairs_attributes_format_check 
CHECK (
  format IS NULL OR 
  format = ANY (ARRAY['value_list_int_array', 'text_content_array', 'raw_json', 'timestamp_utc'])
);