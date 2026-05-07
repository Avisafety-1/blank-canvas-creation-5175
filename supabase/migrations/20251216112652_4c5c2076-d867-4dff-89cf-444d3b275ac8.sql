-- Enable realtime for DroneTag positions
ALTER TABLE public.dronetag_positions REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.dronetag_positions;