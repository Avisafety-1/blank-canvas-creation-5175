CREATE OR REPLACE FUNCTION get_incident_responsible_users(target_company_id uuid)
RETURNS TABLE(id uuid, full_name text)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.id, p.full_name
  FROM profiles p
  WHERE p.approved = true
    AND p.can_be_incident_responsible = true
    AND p.company_id = target_company_id

  UNION

  SELECT p.id, p.full_name
  FROM profiles p
  JOIN companies c ON c.id = target_company_id
  WHERE p.approved = true
    AND p.can_be_incident_responsible = true
    AND c.parent_company_id IS NOT NULL
    AND p.company_id = c.parent_company_id
    AND (
      p.incident_responsible_company_ids @> ARRAY['all']
      OR p.incident_responsible_company_ids @> ARRAY[target_company_id::text]
    )

  ORDER BY full_name ASC;
$$;