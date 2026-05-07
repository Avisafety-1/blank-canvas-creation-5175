-- Drop the old policy that uses JWT claims incorrectly
DROP POLICY IF EXISTS "dronetag_positions_select_company" ON dronetag_positions;

-- Create new policy using the standard function pattern
CREATE POLICY "Users can view dronetag positions from own company"
  ON dronetag_positions
  FOR SELECT
  USING (
    (company_id IS NULL) OR 
    (company_id = get_user_company_id(auth.uid()))
  );