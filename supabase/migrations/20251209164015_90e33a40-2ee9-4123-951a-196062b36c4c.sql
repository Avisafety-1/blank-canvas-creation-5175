-- Add sjekkliste_id column to drones table
ALTER TABLE public.drones ADD COLUMN sjekkliste_id UUID REFERENCES public.documents(id) ON DELETE SET NULL;

-- Add sjekkliste_id column to equipment table
ALTER TABLE public.equipment ADD COLUMN sjekkliste_id UUID REFERENCES public.documents(id) ON DELETE SET NULL;

-- Add index for better query performance
CREATE INDEX idx_drones_sjekkliste_id ON public.drones(sjekkliste_id);
CREATE INDEX idx_equipment_sjekkliste_id ON public.equipment(sjekkliste_id);