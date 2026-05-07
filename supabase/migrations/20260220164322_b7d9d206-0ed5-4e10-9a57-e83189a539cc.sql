ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS can_access_eccairs boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_be_incident_responsible boolean NOT NULL DEFAULT false;