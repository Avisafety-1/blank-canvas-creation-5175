
-- Drop the overly permissive SELECT policy
DROP POLICY IF EXISTS "Authenticated users can view all active flights" ON active_flights;

-- Create company-scoped SELECT policy
-- Advisory/live_uav flights visible to all authenticated users (airspace safety)
-- 'none' flights only visible to own company/departments
CREATE POLICY "Company-scoped active flights visibility"
  ON active_flights FOR SELECT TO authenticated
  USING (
    company_id = ANY(public.get_user_visible_company_ids(auth.uid()))
    OR publish_mode IN ('advisory', 'live_uav')
  );
