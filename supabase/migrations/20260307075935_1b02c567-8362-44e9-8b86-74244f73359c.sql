ALTER TABLE public.drones
  ADD COLUMN IF NOT EXISTS varsel_timer numeric NULL,
  ADD COLUMN IF NOT EXISTS varsel_oppdrag integer NULL;