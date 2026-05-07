
-- =============================================
-- Migrasjon 4: Views med security_invoker = on
-- Slik at RLS på underliggende tabeller respekteres
-- =============================================

-- Gjenskape eccairs_integrations_safe med security_invoker
DROP VIEW IF EXISTS eccairs_integrations_safe;
CREATE VIEW eccairs_integrations_safe
WITH (security_invoker = on) AS
SELECT 
  id,
  company_id,
  environment,
  enabled,
  e2_client_id,
  CASE
    WHEN e2_client_secret_encrypted IS NOT NULL THEN '********'::text
    ELSE NULL::text
  END AS e2_client_secret,
  e2_base_url,
  e2_scope,
  reporting_entity_id,
  responsible_entity_id,
  responsible_entity_value_id,
  taxonomy_version_id,
  created_at,
  updated_at
FROM eccairs_integrations;

-- Gjenskape email_settings_safe med security_invoker
DROP VIEW IF EXISTS email_settings_safe;
CREATE VIEW email_settings_safe
WITH (security_invoker = on) AS
SELECT 
  id,
  company_id,
  smtp_host,
  smtp_port,
  smtp_user,
  CASE
    WHEN smtp_pass IS NOT NULL AND smtp_pass <> '' THEN '********'::text
    ELSE ''::text
  END AS smtp_pass,
  smtp_secure,
  from_name,
  from_email,
  enabled,
  created_at,
  updated_at
FROM email_settings;
