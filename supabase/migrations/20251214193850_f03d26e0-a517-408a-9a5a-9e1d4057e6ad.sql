-- Add before_takeoff_checklist_id to companies table
ALTER TABLE public.companies 
ADD COLUMN before_takeoff_checklist_id uuid REFERENCES public.documents(id) ON DELETE SET NULL;

-- Add comment for documentation
COMMENT ON COLUMN public.companies.before_takeoff_checklist_id IS 'Reference to the before takeoff checklist document for this company';