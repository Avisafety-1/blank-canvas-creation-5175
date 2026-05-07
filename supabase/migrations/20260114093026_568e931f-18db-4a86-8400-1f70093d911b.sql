-- Add ECCAIRS credential fields to eccairs_integrations
ALTER TABLE eccairs_integrations
ADD COLUMN IF NOT EXISTS e2_client_id TEXT,
ADD COLUMN IF NOT EXISTS e2_client_secret_encrypted TEXT,
ADD COLUMN IF NOT EXISTS e2_base_url TEXT,
ADD COLUMN IF NOT EXISTS e2_scope TEXT DEFAULT 'openid';

-- Add unique constraint on company_id + environment for upsert
ALTER TABLE eccairs_integrations 
DROP CONSTRAINT IF EXISTS eccairs_integrations_company_env_unique;

ALTER TABLE eccairs_integrations
ADD CONSTRAINT eccairs_integrations_company_env_unique UNIQUE (company_id, environment);

-- Comments for documentation
COMMENT ON COLUMN eccairs_integrations.e2_client_id IS 'OAuth2 client ID for E2 API';
COMMENT ON COLUMN eccairs_integrations.e2_client_secret_encrypted IS 'Encrypted with pgcrypto via vault secret ECCAIRS_ENCRYPTION_KEY';
COMMENT ON COLUMN eccairs_integrations.e2_base_url IS 'Custom E2 base URL (optional, derived from environment if not set)';
COMMENT ON COLUMN eccairs_integrations.e2_scope IS 'OAuth2 scope (default: openid)';

-- Enable pgcrypto extension if not already enabled
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- RPC function for securely saving credentials (encrypts secret)
CREATE OR REPLACE FUNCTION update_eccairs_credentials(
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
SET search_path = public
AS $$
DECLARE
  v_encryption_key TEXT;
BEGIN
  -- Get encryption key from vault
  SELECT decrypted_secret INTO v_encryption_key 
  FROM vault.decrypted_secrets 
  WHERE name = 'ECCAIRS_ENCRYPTION_KEY';
  
  IF v_encryption_key IS NULL THEN
    RAISE EXCEPTION 'ECCAIRS_ENCRYPTION_KEY not configured in vault';
  END IF;
  
  -- Upsert with encrypted secret
  INSERT INTO eccairs_integrations (
    company_id, environment, e2_client_id, e2_client_secret_encrypted, 
    e2_base_url, e2_scope, enabled
  ) VALUES (
    p_company_id,
    p_environment,
    p_e2_client_id,
    pgp_sym_encrypt(p_e2_client_secret, v_encryption_key),
    p_e2_base_url,
    COALESCE(p_e2_scope, 'openid'),
    true
  )
  ON CONFLICT (company_id, environment) 
  DO UPDATE SET
    e2_client_id = EXCLUDED.e2_client_id,
    e2_client_secret_encrypted = CASE 
      WHEN p_e2_client_secret = '********' THEN eccairs_integrations.e2_client_secret_encrypted
      ELSE pgp_sym_encrypt(p_e2_client_secret, v_encryption_key)
    END,
    e2_base_url = COALESCE(EXCLUDED.e2_base_url, eccairs_integrations.e2_base_url),
    e2_scope = COALESCE(EXCLUDED.e2_scope, eccairs_integrations.e2_scope),
    updated_at = NOW();
END;
$$;

-- RPC function for decrypting credentials (used by gateway with service role)
CREATE OR REPLACE FUNCTION get_eccairs_credentials(
  p_company_id UUID,
  p_environment TEXT
)
RETURNS TABLE(
  e2_client_id TEXT,
  e2_client_secret TEXT,
  e2_base_url TEXT,
  e2_scope TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_encryption_key TEXT;
BEGIN
  -- Get encryption key from vault
  SELECT decrypted_secret INTO v_encryption_key 
  FROM vault.decrypted_secrets 
  WHERE name = 'ECCAIRS_ENCRYPTION_KEY';
  
  -- If no encryption key, return empty
  IF v_encryption_key IS NULL THEN
    RETURN;
  END IF;
  
  RETURN QUERY
  SELECT 
    ei.e2_client_id,
    pgp_sym_decrypt(ei.e2_client_secret_encrypted::bytea, v_encryption_key) AS e2_client_secret,
    ei.e2_base_url,
    ei.e2_scope
  FROM eccairs_integrations ei
  WHERE ei.company_id = p_company_id 
    AND ei.environment = p_environment
    AND ei.enabled = true
    AND ei.e2_client_id IS NOT NULL
    AND ei.e2_client_secret_encrypted IS NOT NULL;
END;
$$;

-- View for safely exposing credentials (masks secret)
CREATE OR REPLACE VIEW eccairs_integrations_safe AS
SELECT 
  id,
  company_id,
  environment,
  enabled,
  e2_client_id,
  CASE WHEN e2_client_secret_encrypted IS NOT NULL THEN '********' ELSE NULL END AS e2_client_secret,
  e2_base_url,
  e2_scope,
  reporting_entity_id,
  responsible_entity_id,
  responsible_entity_value_id,
  taxonomy_version_id,
  created_at,
  updated_at
FROM eccairs_integrations;

-- Grant access to the view
GRANT SELECT ON eccairs_integrations_safe TO authenticated;