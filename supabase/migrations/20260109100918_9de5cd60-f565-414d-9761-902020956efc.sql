-- Add entity_path column for entity-level attributes (e.g., Aircraft = "4")
ALTER TABLE public.incident_eccairs_attributes 
ADD COLUMN IF NOT EXISTS entity_path TEXT DEFAULT NULL;

-- Add comment explaining usage
COMMENT ON COLUMN public.incident_eccairs_attributes.entity_path IS 
'Entity path for entity-level attributes. NULL = top-level (Occurrence/Entity 24). "4" = Aircraft entity, etc.';