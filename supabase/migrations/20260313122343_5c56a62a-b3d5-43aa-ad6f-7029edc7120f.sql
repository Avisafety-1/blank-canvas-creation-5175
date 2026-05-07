-- missions.approved_by
ALTER TABLE missions
  DROP CONSTRAINT missions_approved_by_fkey,
  ADD CONSTRAINT missions_approved_by_fkey
    FOREIGN KEY (approved_by) REFERENCES auth.users(id) ON DELETE SET NULL;

-- profiles.approved_by  
ALTER TABLE profiles
  DROP CONSTRAINT profiles_approved_by_fkey,
  ADD CONSTRAINT profiles_approved_by_fkey
    FOREIGN KEY (approved_by) REFERENCES auth.users(id) ON DELETE SET NULL;

-- revenue_calculator_scenarios.updated_by
ALTER TABLE revenue_calculator_scenarios
  DROP CONSTRAINT revenue_calculator_scenarios_updated_by_fkey,
  ADD CONSTRAINT revenue_calculator_scenarios_updated_by_fkey
    FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL;