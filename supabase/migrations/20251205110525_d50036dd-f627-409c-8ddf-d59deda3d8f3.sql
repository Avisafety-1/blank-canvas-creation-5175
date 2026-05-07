-- Add vekt and vedlikeholdsintervall_dager columns to equipment table
ALTER TABLE public.equipment 
ADD COLUMN IF NOT EXISTS vekt numeric NULL,
ADD COLUMN IF NOT EXISTS vedlikeholdsintervall_dager integer NULL,
ADD COLUMN IF NOT EXISTS vedlikehold_startdato timestamp with time zone NULL;