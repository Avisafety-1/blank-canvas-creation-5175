-- Fix search_path for ECCAIRS credential functions to include extensions schema for pgcrypto
-- This allows pgp_sym_encrypt and pgp_sym_decrypt to be found

CREATE OR REPLACE FUNCTION public.update_eccairs_credentials(
  p_company_id UUID,
  p_environment TEXT,
  p_e2_client_id TEXT,
  p_e2_client_secret TEXT,
  p_e2_base_url TEXT DEFAULT NULL,
  p_e2_scope TEXT DEFAULT 'openid'
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_encryption_key TEXT;
  v_encrypted_secret TEXT;
BEGIN
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
    FROM eccairs_integrations
    WHERE company_id = p_company_id AND environment = p_environment;
  END IF;

  -- Upsert the integration settings
  INSERT INTO eccairs_integrations (
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
    p_e2_scope,
    TRUE,
    NOW()
  )
  ON CONFLICT (company_id, environment)
  DO UPDATE SET
    e2_client_id = EXCLUDED.e2_client_id,
    e2_client_secret_encrypted = COALESCE(v_encrypted_secret, eccairs_integrations.e2_client_secret_encrypted),
    e2_base_url = EXCLUDED.e2_base_url,
    e2_scope = EXCLUDED.e2_scope,
    enabled = TRUE,
    updated_at = NOW();
END;
$$;

CREATE OR REPLACE FUNCTION public.get_eccairs_credentials(
  p_company_id UUID,
  p_environment TEXT DEFAULT 'sandbox'
)
RETURNS TABLE (
  e2_client_id TEXT,
  e2_client_secret TEXT,
  e2_base_url TEXT,
  e2_scope TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_encryption_key TEXT;
BEGIN
  -- Get encryption key from vault
  SELECT decrypted_secret INTO v_encryption_key
  FROM vault.decrypted_secrets
  WHERE name = 'ECCAIRS_ENCRYPTION_KEY'
  LIMIT 1;

  IF v_encryption_key IS NULL THEN
    RAISE EXCEPTION 'Encryption key not found in vault';
  END IF;

  RETURN QUERY
  SELECT
    ei.e2_client_id,
    CASE
      WHEN ei.e2_client_secret_encrypted IS NOT NULL
      THEN pgp_sym_decrypt(ei.e2_client_secret_encrypted::bytea, v_encryption_key)
      ELSE NULL
    END AS e2_client_secret,
    ei.e2_base_url,
    ei.e2_scope
  FROM eccairs_integrations ei
  WHERE ei.company_id = p_company_id
    AND ei.environment = p_environment
    AND ei.enabled = TRUE;
END;
$$;