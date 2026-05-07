-- Legge til kolonne for lagring av værdata når oppdraget fullføres
ALTER TABLE public.missions ADD COLUMN IF NOT EXISTS weather_data_snapshot jsonb DEFAULT NULL;