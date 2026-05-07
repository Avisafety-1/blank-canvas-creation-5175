-- Fix the view security - make it security invoker (default, not security definer)
-- and add proper RLS-like filtering based on user's company

DROP VIEW IF EXISTS eccairs_integrations_safe;

CREATE VIEW eccairs_integrations_safe 
WITH (security_invoker = true)
AS
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