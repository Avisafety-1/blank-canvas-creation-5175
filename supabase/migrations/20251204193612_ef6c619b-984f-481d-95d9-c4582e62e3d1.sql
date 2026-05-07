-- Add new columns to drones table
ALTER TABLE public.drones ADD COLUMN IF NOT EXISTS vekt numeric;
ALTER TABLE public.drones ADD COLUMN IF NOT EXISTS payload numeric;
ALTER TABLE public.drones ADD COLUMN IF NOT EXISTS inspection_start_date timestamp with time zone;
ALTER TABLE public.drones ADD COLUMN IF NOT EXISTS inspection_interval_days integer;