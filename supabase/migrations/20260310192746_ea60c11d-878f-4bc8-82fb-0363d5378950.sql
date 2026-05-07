ALTER TABLE public.drone_models
  ADD COLUMN weight_without_payload_kg NUMERIC DEFAULT NULL,
  ADD COLUMN standard_takeoff_weight_kg NUMERIC DEFAULT NULL;