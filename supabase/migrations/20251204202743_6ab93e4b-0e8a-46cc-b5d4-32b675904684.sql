-- Add configurable warning days column to drones
ALTER TABLE drones ADD COLUMN IF NOT EXISTS varsel_dager integer DEFAULT 14;

-- Add configurable warning days column to drone_accessories
ALTER TABLE drone_accessories ADD COLUMN IF NOT EXISTS varsel_dager integer DEFAULT 14;

-- Add configurable warning days column to equipment
ALTER TABLE equipment ADD COLUMN IF NOT EXISTS varsel_dager integer DEFAULT 14;