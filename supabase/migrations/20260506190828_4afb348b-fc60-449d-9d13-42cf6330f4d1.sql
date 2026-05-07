-- Drop dependent view and old RPC
DROP VIEW IF EXISTS public.email_settings_safe;
DROP FUNCTION IF EXISTS public.update_email_settings(uuid, text, integer, text, text, boolean, text, text, boolean);

-- Drop unused SMTP columns (now using Resend)
ALTER TABLE public.email_settings
  DROP COLUMN IF EXISTS smtp_host,
  DROP COLUMN IF EXISTS smtp_port,
  DROP COLUMN IF EXISTS smtp_user,
  DROP COLUMN IF EXISTS smtp_pass,
  DROP COLUMN IF EXISTS smtp_secure;

-- Recreate safe view (no SMTP fields anymore)
CREATE VIEW public.email_settings_safe AS
SELECT 
  id,
  company_id,
  from_name,
  from_email,
  enabled,
  created_at,
  updated_at
FROM public.email_settings;

ALTER VIEW public.email_settings_safe OWNER TO postgres;
GRANT SELECT ON public.email_settings_safe TO authenticated;

-- Simplified RPC: only avsender info
CREATE OR REPLACE FUNCTION public.update_email_settings(
  p_company_id UUID,
  p_from_name TEXT,
  p_from_email TEXT,
  p_enabled BOOLEAN
) RETURNS VOID AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM profiles 
    WHERE id = auth.uid() 
    AND company_id = p_company_id
  ) AND NOT public.is_superadmin(auth.uid()) THEN
    RAISE EXCEPTION 'Ingen tilgang til dette selskapet';
  END IF;

  INSERT INTO public.email_settings (company_id, from_name, from_email, enabled)
  VALUES (p_company_id, p_from_name, p_from_email, p_enabled)
  ON CONFLICT (company_id) DO UPDATE SET
    from_name = EXCLUDED.from_name,
    from_email = EXCLUDED.from_email,
    enabled = EXCLUDED.enabled,
    updated_at = NOW();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE EXECUTE ON FUNCTION public.update_email_settings(uuid, text, text, boolean) FROM anon;
GRANT EXECUTE ON FUNCTION public.update_email_settings(uuid, text, text, boolean) TO authenticated;