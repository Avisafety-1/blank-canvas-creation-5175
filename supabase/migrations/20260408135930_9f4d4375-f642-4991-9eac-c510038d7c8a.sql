
ALTER TABLE public.incidents
  ADD COLUMN pilot_id UUID REFERENCES public.profiles(id),
  ADD COLUMN drone_id UUID REFERENCES public.drones(id),
  ADD COLUMN equipment_ids UUID[];
