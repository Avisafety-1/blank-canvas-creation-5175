ALTER TABLE public.drone_models
ADD COLUMN category TEXT,
ADD COLUMN endurance_min INTEGER,
ADD COLUMN max_wind_mps NUMERIC,
ADD COLUMN sensor_type TEXT;