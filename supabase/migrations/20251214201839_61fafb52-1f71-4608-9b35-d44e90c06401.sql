-- Add safesky_mode and completed_checklists to flight_logs table
ALTER TABLE public.flight_logs
ADD COLUMN safesky_mode text,
ADD COLUMN completed_checklists uuid[];