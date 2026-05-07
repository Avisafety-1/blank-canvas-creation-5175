
-- Function to upsert encrypted LinkedIn token
CREATE OR REPLACE FUNCTION public.upsert_linkedin_token(
  p_company_id UUID,
  p_access_token TEXT,
  p_refresh_token TEXT,
  p_member_urn TEXT,
  p_expires_at TIMESTAMPTZ,
  p_encryption_key TEXT
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.linkedin_tokens (company_id, access_token_encrypted, refresh_token_encrypted, member_urn, expires_at, updated_at)
  VALUES (
    p_company_id,
    pgp_sym_encrypt(p_access_token, p_encryption_key),
    CASE WHEN p_refresh_token != '' THEN pgp_sym_encrypt(p_refresh_token, p_encryption_key) ELSE NULL END,
    p_member_urn,
    p_expires_at,
    now()
  )
  ON CONFLICT (company_id) DO UPDATE SET
    access_token_encrypted = pgp_sym_encrypt(p_access_token, p_encryption_key),
    refresh_token_encrypted = CASE WHEN p_refresh_token != '' THEN pgp_sym_encrypt(p_refresh_token, p_encryption_key) ELSE linkedin_tokens.refresh_token_encrypted END,
    member_urn = p_member_urn,
    expires_at = p_expires_at,
    updated_at = now();
END;
$$;

-- Function to get decrypted LinkedIn token
CREATE OR REPLACE FUNCTION public.get_linkedin_token(
  p_company_id UUID,
  p_encryption_key TEXT
)
RETURNS TABLE(access_token TEXT, refresh_token TEXT, member_urn TEXT, expires_at TIMESTAMPTZ)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    pgp_sym_decrypt(lt.access_token_encrypted::bytea, p_encryption_key) AS access_token,
    CASE WHEN lt.refresh_token_encrypted IS NOT NULL
      THEN pgp_sym_decrypt(lt.refresh_token_encrypted::bytea, p_encryption_key)
      ELSE NULL
    END AS refresh_token,
    lt.member_urn,
    lt.expires_at
  FROM public.linkedin_tokens lt
  WHERE lt.company_id = p_company_id;
END;
$$;
