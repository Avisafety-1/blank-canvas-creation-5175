-- Funksjon som oppretter standard email_settings for nytt selskap
CREATE OR REPLACE FUNCTION public.create_default_email_settings()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.email_settings (
    company_id,
    smtp_host,
    smtp_port,
    smtp_user,
    smtp_pass,
    smtp_secure,
    from_name,
    from_email,
    enabled
  ) VALUES (
    NEW.id,
    'send.one.com',
    465,
    'noreply@avisafe.no',
    'Avisafe!',
    true,
    'AviSafe',
    'noreply@avisafe.no',
    true
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Trigger som kjører etter at et nytt selskap opprettes
DROP TRIGGER IF EXISTS on_company_created_create_email_settings ON public.companies;
CREATE TRIGGER on_company_created_create_email_settings
AFTER INSERT ON public.companies
FOR EACH ROW
EXECUTE FUNCTION public.create_default_email_settings();

-- Fyll inn manglende email_settings for eksisterende selskaper
INSERT INTO public.email_settings (
  company_id, smtp_host, smtp_port, smtp_user, smtp_pass, 
  smtp_secure, from_name, from_email, enabled
)
SELECT 
  c.id,
  'send.one.com',
  465,
  'noreply@avisafe.no',
  'Avisafe!',
  true,
  'AviSafe',
  'noreply@avisafe.no',
  true
FROM public.companies c
LEFT JOIN public.email_settings es ON c.id = es.company_id
WHERE es.id IS NULL;