-- Make mission_risk_assessments.pilot_id nullable and add ON DELETE SET NULL
ALTER TABLE mission_risk_assessments ALTER COLUMN pilot_id DROP NOT NULL;

ALTER TABLE mission_risk_assessments 
  DROP CONSTRAINT mission_risk_assessments_pilot_id_fkey,
  ADD CONSTRAINT mission_risk_assessments_pilot_id_fkey 
    FOREIGN KEY (pilot_id) REFERENCES profiles(id) ON DELETE SET NULL;

-- Also fix mission_sora FK rules
ALTER TABLE mission_sora
  DROP CONSTRAINT IF EXISTS mission_sora_prepared_by_fkey,
  ADD CONSTRAINT mission_sora_prepared_by_fkey
    FOREIGN KEY (prepared_by) REFERENCES profiles(id) ON DELETE SET NULL;

ALTER TABLE mission_sora
  DROP CONSTRAINT IF EXISTS mission_sora_approved_by_fkey,
  ADD CONSTRAINT mission_sora_approved_by_fkey
    FOREIGN KEY (approved_by) REFERENCES profiles(id) ON DELETE SET NULL;