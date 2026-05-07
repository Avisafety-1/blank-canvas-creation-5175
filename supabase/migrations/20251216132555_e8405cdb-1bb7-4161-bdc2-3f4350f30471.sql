-- Add drone_id column to dronetag_devices to link DroneTag devices to drones
ALTER TABLE public.dronetag_devices 
ADD COLUMN drone_id uuid REFERENCES public.drones(id) ON DELETE SET NULL;

-- Add index for efficient lookups
CREATE INDEX idx_dronetag_devices_drone_id ON public.dronetag_devices(drone_id);