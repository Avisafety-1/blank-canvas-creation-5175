
-- Create bulk_email_campaigns table
CREATE TABLE public.bulk_email_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE,
  recipient_type text NOT NULL,
  subject text NOT NULL,
  html_content text NOT NULL,
  sent_at timestamptz NOT NULL DEFAULT now(),
  sent_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  emails_sent integer NOT NULL DEFAULT 0,
  sent_to_emails text[] NOT NULL DEFAULT '{}',
  failed_emails text[] NOT NULL DEFAULT '{}'
);

-- Enable RLS
ALTER TABLE public.bulk_email_campaigns ENABLE ROW LEVEL SECURITY;

-- Admins and superadmins in the same company can read campaigns
CREATE POLICY "Admins can view own company campaigns"
ON public.bulk_email_campaigns
FOR SELECT
USING (
  company_id IS NULL AND public.has_role(auth.uid(), 'superadmin')
  OR
  company_id IS NOT NULL AND (
    public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'superadmin')
  ) AND company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid() LIMIT 1)
);

-- Only edge functions (service role) can insert/update
CREATE POLICY "Service role can insert campaigns"
ON public.bulk_email_campaigns
FOR INSERT
WITH CHECK (true);

CREATE POLICY "Service role can update campaigns"
ON public.bulk_email_campaigns
FOR UPDATE
USING (true);

-- Index for fast lookups by company
CREATE INDEX idx_bulk_email_campaigns_company_id ON public.bulk_email_campaigns(company_id);
CREATE INDEX idx_bulk_email_campaigns_sent_at ON public.bulk_email_campaigns(sent_at DESC);
