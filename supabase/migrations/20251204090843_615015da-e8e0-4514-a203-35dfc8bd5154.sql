-- Opprett view som maskerer passord for frontend
CREATE OR REPLACE VIEW public.email_settings_safe AS
SELECT 
  id,
  company_id,
  smtp_host,
  smtp_port,
  smtp_user,
  CASE WHEN smtp_pass IS NOT NULL AND smtp_pass != '' 
       THEN '********' 
       ELSE '' 
  END as smtp_pass,
  smtp_secure,
  from_name,
  from_email,
  enabled,
  created_at,
  updated_at
FROM public.email_settings;

-- RLS for view
ALTER VIEW public.email_settings_safe OWNER TO postgres;

-- Grant access to authenticated users
GRANT SELECT ON public.email_settings_safe TO authenticated;

-- RPC-funksjon for sikker oppdatering av e-postinnstillinger
CREATE OR REPLACE FUNCTION public.update_email_settings(
  p_company_id UUID,
  p_smtp_host TEXT,
  p_smtp_port INTEGER,
  p_smtp_user TEXT,
  p_smtp_pass TEXT,
  p_smtp_secure BOOLEAN,
  p_from_name TEXT,
  p_from_email TEXT,
  p_enabled BOOLEAN
) RETURNS VOID AS $$
BEGIN
  -- Sjekk at brukeren har tilgang til selskapet
  IF NOT EXISTS (
    SELECT 1 FROM profiles 
    WHERE id = auth.uid() 
    AND company_id = p_company_id
  ) AND NOT public.is_superadmin(auth.uid()) THEN
    RAISE EXCEPTION 'Ingen tilgang til dette selskapet';
  END IF;

  -- Oppdater innstillinger, behold eksisterende passord hvis '********' sendes
  UPDATE public.email_settings
  SET 
    smtp_host = p_smtp_host,
    smtp_port = p_smtp_port,
    smtp_user = p_smtp_user,
    smtp_pass = CASE 
      WHEN p_smtp_pass = '********' THEN smtp_pass  -- Behold eksisterende
      ELSE p_smtp_pass  -- Bruk nytt passord
    END,
    smtp_secure = p_smtp_secure,
    from_name = p_from_name,
    from_email = p_from_email,
    enabled = p_enabled,
    updated_at = NOW()
  WHERE company_id = p_company_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;