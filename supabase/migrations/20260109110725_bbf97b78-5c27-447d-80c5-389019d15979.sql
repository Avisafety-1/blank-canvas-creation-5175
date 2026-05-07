-- Drop the old status constraint and create a new one with all valid statuses
ALTER TABLE public.eccairs_exports DROP CONSTRAINT IF EXISTS eccairs_exports_status_chk;

ALTER TABLE public.eccairs_exports ADD CONSTRAINT eccairs_exports_status_chk 
CHECK (status IN ('pending', 'draft_created', 'draft_updated', 'submitted', 'failed', 'delete_failed'));