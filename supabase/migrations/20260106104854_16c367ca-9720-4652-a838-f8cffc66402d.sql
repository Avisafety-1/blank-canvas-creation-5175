-- ECCAIRS exports per incident
CREATE TABLE IF NOT EXISTS public.eccairs_exports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  incident_id uuid NOT NULL REFERENCES public.incidents(id) ON DELETE CASCADE,
  environment text NOT NULL DEFAULT 'sandbox',
  status text NOT NULL DEFAULT 'pending',
  e2_id text,
  e2_version text,
  attempts integer NOT NULL DEFAULT 0,
  last_attempt_at timestamptz,
  last_error text,
  payload jsonb,
  response jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- helpful indexes
CREATE INDEX IF NOT EXISTS eccairs_exports_incident_idx ON public.eccairs_exports(incident_id);
CREATE INDEX IF NOT EXISTS eccairs_exports_company_idx ON public.eccairs_exports(company_id);
CREATE UNIQUE INDEX IF NOT EXISTS eccairs_exports_incident_env_uq
ON public.eccairs_exports(incident_id, environment);

-- RLS
ALTER TABLE public.eccairs_exports ENABLE ROW LEVEL SECURITY;

-- policies
CREATE POLICY "Users can view exports from own company"
ON public.eccairs_exports
FOR SELECT
USING (company_id = get_user_company_id(auth.uid()));

CREATE POLICY "Users can create exports in own company"
ON public.eccairs_exports
FOR INSERT
WITH CHECK (company_id = get_user_company_id(auth.uid()));

CREATE POLICY "Admins can manage exports in own company"
ON public.eccairs_exports
FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role) AND company_id = get_user_company_id(auth.uid()))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role) AND company_id = get_user_company_id(auth.uid()));

CREATE POLICY "Superadmins can manage all exports"
ON public.eccairs_exports
FOR ALL
USING (is_superadmin(auth.uid()))
WITH CHECK (is_superadmin(auth.uid()));

-- updated_at trigger (reuse your function)
DROP TRIGGER IF EXISTS trg_eccairs_exports_updated_at ON public.eccairs_exports;
CREATE TRIGGER trg_eccairs_exports_updated_at
BEFORE UPDATE ON public.eccairs_exports
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

-- safety constraints
ALTER TABLE public.eccairs_exports
ADD CONSTRAINT eccairs_exports_environment_chk
CHECK (environment IN ('sandbox', 'prod'));

ALTER TABLE public.eccairs_exports
ADD CONSTRAINT eccairs_exports_status_chk
CHECK (status IN ('pending','draft_created','submitted','failed'));