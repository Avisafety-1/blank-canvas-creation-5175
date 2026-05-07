-- Rename registrering to serienummer
ALTER TABLE drones RENAME COLUMN registrering TO serienummer;

-- Add new columns for purchase date and class
ALTER TABLE drones ADD COLUMN kjøpsdato timestamp with time zone;
ALTER TABLE drones ADD COLUMN klasse text;