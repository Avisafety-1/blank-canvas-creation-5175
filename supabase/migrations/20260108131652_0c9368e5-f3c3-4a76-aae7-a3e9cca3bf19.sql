-- Drop the existing constraint first
ALTER TABLE incident_eccairs_attributes 
DROP CONSTRAINT IF EXISTS incident_eccairs_attributes_format_check;

-- Update any existing timestamp_utc format values to local_date BEFORE adding constraint
UPDATE incident_eccairs_attributes 
SET format = 'local_date' 
WHERE format = 'timestamp_utc';

-- Now add the updated constraint with local_date
ALTER TABLE incident_eccairs_attributes 
ADD CONSTRAINT incident_eccairs_attributes_format_check 
CHECK (
  format IS NULL OR 
  format = ANY (ARRAY['value_list_int_array', 'text_content_array', 'raw_json', 'local_date'])
);