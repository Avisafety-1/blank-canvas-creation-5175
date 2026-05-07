-- Add operation_type to flight_logs
ALTER TABLE public.flight_logs
  ADD COLUMN IF NOT EXISTS operation_type text NOT NULL DEFAULT 'VLOS';

ALTER TABLE public.flight_logs
  DROP CONSTRAINT IF EXISTS flight_logs_operation_type_check;

ALTER TABLE public.flight_logs
  ADD CONSTRAINT flight_logs_operation_type_check
  CHECK (operation_type IN ('VLOS','BVLOS','EVLOS'));

-- Backfill any nulls just in case (column has default, but be safe)
UPDATE public.flight_logs SET operation_type = 'VLOS' WHERE operation_type IS NULL;

-- Index for stats aggregation
CREATE INDEX IF NOT EXISTS idx_flight_logs_company_optype_date
  ON public.flight_logs (company_id, operation_type, flight_date);