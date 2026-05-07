-- Create eccairs_integrations table
CREATE TABLE IF NOT EXISTS public.eccairs_integrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  environment text NOT NULL DEFAULT 'sandbox',
  enabled boolean NOT NULL DEFAULT true,
  reporting_entity_id integer,
  responsible_entity_id integer,
  taxonomy_version_id integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Unique index for company + environment
CREATE UNIQUE INDEX IF NOT EXISTS eccairs_integrations_company_env_uq
ON public.eccairs_integrations(company_id, environment);

-- Enable RLS
ALTER TABLE public.eccairs_integrations ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Users can view eccairs integrations from own company"
ON public.eccairs_integrations
FOR SELECT
USING (company_id = get_user_company_id(auth.uid()));

CREATE POLICY "Admins can manage eccairs integrations in own company"
ON public.eccairs_integrations
FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role) AND company_id = get_user_company_id(auth.uid()))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role) AND company_id = get_user_company_id(auth.uid()));

CREATE POLICY "Superadmins can manage all eccairs integrations"
ON public.eccairs_integrations
FOR ALL
USING (is_superadmin(auth.uid()))
WITH CHECK (is_superadmin(auth.uid()));

-- updated_at helper function
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- Trigger for auto-updating updated_at
DROP TRIGGER IF EXISTS trg_eccairs_integrations_updated_at ON public.eccairs_integrations;
CREATE TRIGGER trg_eccairs_integrations_updated_at
BEFORE UPDATE ON public.eccairs_integrations
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();