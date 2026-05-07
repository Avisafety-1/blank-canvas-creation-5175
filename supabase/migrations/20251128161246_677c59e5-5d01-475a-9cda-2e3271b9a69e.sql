-- Create email_settings table for storing SMTP configuration per company
CREATE TABLE public.email_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  smtp_host TEXT,
  smtp_port INTEGER DEFAULT 587,
  smtp_user TEXT,
  smtp_pass TEXT,
  smtp_secure BOOLEAN DEFAULT false,
  from_name TEXT,
  from_email TEXT,
  enabled BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  UNIQUE(company_id)
);

-- Enable Row Level Security
ALTER TABLE public.email_settings ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Admins can manage email settings in own company
CREATE POLICY "Admins can manage email settings in own company"
ON public.email_settings
FOR ALL
USING (
  has_role(auth.uid(), 'admin'::app_role) 
  AND company_id = get_user_company_id(auth.uid())
)
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role) 
  AND company_id = get_user_company_id(auth.uid())
);

-- RLS Policy: Superadmins can manage all email settings
CREATE POLICY "Superadmins can manage all email settings"
ON public.email_settings
FOR ALL
USING (is_superadmin(auth.uid()))
WITH CHECK (is_superadmin(auth.uid()));

-- Create trigger for automatic updated_at timestamp
CREATE TRIGGER update_email_settings_updated_at
BEFORE UPDATE ON public.email_settings
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();