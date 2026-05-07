-- Allow empty/NULL E2 OAuth scope (do not force 'openid')

-- 1) Remove column default so new rows don't automatically get 'openid'
ALTER TABLE public.eccairs_integrations
  ALTER COLUMN e2_scope DROP DEFAULT;

-- 2) Update RPC to treat empty string as NULL and stop defaulting to 'openid'
CREATE OR REPLACE FUNCTION public.update_eccairs_credentials(
  p_company_id UUID,
  p_environment TEXT,
  p_e2_client_id TEXT,
  p_e2_client_secret TEXT,
  p_e2_base_url TEXT DEFAULT NULL,
  p_e2_scope TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_encryption_key TEXT;
  v_encrypted_secret TEXT;
  v_scope TEXT;
BEGIN
  -- Normalize scope: empty string -> NULL
  v_scope := NULLIF(BTRIM(p_e2_scope), '');

  -- Get encryption key from vault
  SELECT decrypted_secret INTO v_encryption_key
  FROM vault.decrypted_secrets
  WHERE name = 'ECCAIRS_ENCRYPTION_KEY'
  LIMIT 1;

  IF v_encryption_key IS NULL THEN
    RAISE EXCEPTION 'Encryption key not found in vault';
  END IF;

  -- Only encrypt if a real secret is provided (not the placeholder)
  IF p_e2_client_secret IS NOT NULL AND p_e2_client_secret != '********' THEN
    v_encrypted_secret := pgp_sym_encrypt(p_e2_client_secret, v_encryption_key);
  ELSE
    -- Keep existing secret
    SELECT e2_client_secret_encrypted INTO v_encrypted_secret
    FROM public.eccairs_integrations
    WHERE company_id = p_company_id AND environment = p_environment;
  END IF;

  -- Upsert the integration settings
  INSERT INTO public.eccairs_integrations (
    company_id,
    environment,
    e2_client_id,
    e2_client_secret_encrypted,
    e2_base_url,
    e2_scope,
    enabled,
    updated_at
  )
  VALUES (
    p_company_id,
    p_environment,
    p_e2_client_id,
    v_encrypted_secret,
    p_e2_base_url,
    v_scope,
    TRUE,
    NOW()
  )
  ON CONFLICT (company_id, environment)
  DO UPDATE SET
    e2_client_id = EXCLUDED.e2_client_id,
    e2_client_secret_encrypted = COALESCE(v_encrypted_secret, public.eccairs_integrations.e2_client_secret_encrypted),
    e2_base_url = EXCLUDED.e2_base_url,
    e2_scope = EXCLUDED.e2_scope,
    enabled = TRUE,
    updated_at = NOW();
END;
$$;