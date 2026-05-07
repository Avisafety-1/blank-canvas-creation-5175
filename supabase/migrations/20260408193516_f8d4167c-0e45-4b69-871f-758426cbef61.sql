
-- Add FlightHub 2 configuration columns to companies
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS flighthub2_token text,
  ADD COLUMN IF NOT EXISTS flighthub2_base_url text DEFAULT 'https://openapi.dji.com';
