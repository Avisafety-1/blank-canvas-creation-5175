CREATE OR REPLACE FUNCTION public.create_default_email_settings()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.email_settings (
    company_id, smtp_host, smtp_port, smtp_user, smtp_pass,
    smtp_secure, from_name, from_email, enabled
  ) VALUES (
    NEW.id,
    'send.one.com',
    465,
    'noreply@avisafe.no',
    NULL,
    true,
    'AviSafe',
    'noreply@avisafe.no',
    true
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

UPDATE public.email_settings
SET smtp_pass = NULL
WHERE smtp_pass = 'Avisafe!'
  AND smtp_host = 'send.one.com'
  AND smtp_user = 'noreply@avisafe.no';