-- Add column to store multiple before takeoff checklists for the company
ALTER TABLE public.companies 
ADD COLUMN IF NOT EXISTS before_takeoff_checklist_ids uuid[] DEFAULT '{}';

-- Migrate existing single checklist to new array (if any)
UPDATE public.companies 
SET before_takeoff_checklist_ids = ARRAY[before_takeoff_checklist_id]
WHERE before_takeoff_checklist_id IS NOT NULL 
AND (before_takeoff_checklist_ids IS NULL OR before_takeoff_checklist_ids = '{}');