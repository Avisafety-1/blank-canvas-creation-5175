ALTER TABLE public.drones
  ADD COLUMN operations_checklist_id UUID REFERENCES public.documents(id);