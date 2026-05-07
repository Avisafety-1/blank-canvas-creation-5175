-- Add technical_responsible_id to drones
ALTER TABLE drones ADD COLUMN technical_responsible_id UUID REFERENCES profiles(id) ON DELETE SET NULL;

-- Add is_technical_responsible to profiles
ALTER TABLE profiles ADD COLUMN is_technical_responsible BOOLEAN DEFAULT false;