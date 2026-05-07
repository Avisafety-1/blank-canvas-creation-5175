-- Add company type column to companies table
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS selskapstype text DEFAULT 'droneoperator';

-- Add check constraint to ensure valid values
ALTER TABLE public.companies ADD CONSTRAINT companies_selskapstype_check 
CHECK (selskapstype IN ('droneoperator', 'flyselskap'));