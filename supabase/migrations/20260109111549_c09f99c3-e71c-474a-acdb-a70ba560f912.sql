-- Fjern eksisterende constraint
ALTER TABLE public.incident_eccairs_attributes 
DROP CONSTRAINT IF EXISTS incident_eccairs_attributes_format_check;

-- Legg til oppdatert constraint med alle format-typer
ALTER TABLE public.incident_eccairs_attributes 
ADD CONSTRAINT incident_eccairs_attributes_format_check 
CHECK (
  (format IS NULL) OR 
  (format = ANY (ARRAY[
    'value_list_int_array',
    'text_content_array',
    'string_array',
    'content_object_array',
    'raw_json',
    'local_date'
  ]::text[]))
);