
CREATE OR REPLACE FUNCTION get_mission_approvers(target_company_id uuid)
RETURNS TABLE(id uuid, full_name text)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.id, p.full_name
  FROM profiles p
  WHERE p.approved = true
    AND p.can_approve_missions = true
    AND p.company_id = target_company_id

  UNION

  SELECT p.id, p.full_name
  FROM profiles p
  JOIN companies c ON c.id = target_company_id
  WHERE p.approved = true
    AND p.can_approve_missions = true
    AND c.parent_company_id IS NOT NULL
    AND p.company_id = c.parent_company_id
    AND (
      p.approval_company_ids @> ARRAY['all']
      OR p.approval_company_ids @> ARRAY[target_company_id::text]
    )

  ORDER BY full_name ASC;
$$;
