-- Drop the existing restrictive policy
DROP POLICY IF EXISTS "Users can view their own active flights" ON active_flights;

-- Create new policy that allows all authenticated users to see all active flights
-- This is needed for SafeSky advisory areas to be visible to all operators
CREATE POLICY "Authenticated users can view all active flights" 
  ON active_flights 
  FOR SELECT 
  USING (auth.uid() IS NOT NULL);