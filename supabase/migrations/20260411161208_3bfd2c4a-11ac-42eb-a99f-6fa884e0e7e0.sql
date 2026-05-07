
-- Create table for encrypted LinkedIn OAuth tokens
CREATE TABLE public.linkedin_tokens (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  access_token_encrypted TEXT NOT NULL,
  refresh_token_encrypted TEXT,
  member_urn TEXT NOT NULL,
  expires_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (company_id)
);

-- Enable RLS
ALTER TABLE public.linkedin_tokens ENABLE ROW LEVEL SECURITY;

-- Only company members can read their own tokens
CREATE POLICY "Company members can view their LinkedIn tokens"
  ON public.linkedin_tokens
  FOR SELECT
  TO authenticated
  USING (
    company_id IN (
      SELECT company_id FROM public.profiles WHERE id = auth.uid()
    )
  );

-- Service role handles insert/update via edge functions (no user-facing write policy needed)
