
-- 1. Create table
CREATE TABLE IF NOT EXISTS public.company_fh2_credentials (
  company_id UUID PRIMARY KEY REFERENCES public.companies(id) ON DELETE CASCADE,
  token_encrypted TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Enable RLS
ALTER TABLE public.company_fh2_credentials ENABLE ROW LEVEL SECURITY;

-- 3. RLS policies
CREATE POLICY "Company admins can view own FH2 credentials"
  ON public.company_fh2_credentials FOR SELECT TO authenticated
  USING (company_id = ANY(public.get_user_visible_company_ids(auth.uid())) AND public.has_role(auth.uid(), 'administrator'));

CREATE POLICY "Company admins can insert own FH2 credentials"
  ON public.company_fh2_credentials FOR INSERT TO authenticated
  WITH CHECK (company_id = ANY(public.get_user_visible_company_ids(auth.uid())) AND public.has_role(auth.uid(), 'administrator'));

CREATE POLICY "Company admins can update own FH2 credentials"
  ON public.company_fh2_credentials FOR UPDATE TO authenticated
  USING (company_id = ANY(public.get_user_visible_company_ids(auth.uid())) AND public.has_role(auth.uid(), 'administrator'));

CREATE POLICY "Company admins can delete own FH2 credentials"
  ON public.company_fh2_credentials FOR DELETE TO authenticated
  USING (company_id = ANY(public.get_user_visible_company_ids(auth.uid())) AND public.has_role(auth.uid(), 'administrator'));

-- 4. Save function
CREATE OR REPLACE FUNCTION public.save_fh2_token(p_company_id UUID, p_token TEXT, p_key TEXT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
BEGIN
  INSERT INTO public.company_fh2_credentials (company_id, token_encrypted, updated_at)
  VALUES (p_company_id, pgp_sym_encrypt(p_token, p_key), now())
  ON CONFLICT (company_id) DO UPDATE SET token_encrypted = pgp_sym_encrypt(p_token, p_key), updated_at = now();
END;
$$;

-- 5. Get function
CREATE OR REPLACE FUNCTION public.get_fh2_token(p_company_id UUID, p_key TEXT)
RETURNS TEXT LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE v_encrypted TEXT;
BEGIN
  SELECT token_encrypted INTO v_encrypted FROM public.company_fh2_credentials WHERE company_id = p_company_id;
  IF v_encrypted IS NULL THEN RETURN NULL; END IF;
  RETURN pgp_sym_decrypt(v_encrypted::bytea, p_key);
END;
$$;
