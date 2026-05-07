
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS approval_company_ids text[],
ADD COLUMN IF NOT EXISTS incident_responsible_company_ids text[];

COMMENT ON COLUMN public.profiles.approval_company_ids IS 'Array of company IDs the user can approve missions for. NULL = fallback to can_approve_missions boolean. [''all''] = all departments.';
COMMENT ON COLUMN public.profiles.incident_responsible_company_ids IS 'Array of company IDs the user can be incident responsible for. NULL = fallback to can_be_incident_responsible boolean. [''all''] = all departments.';
