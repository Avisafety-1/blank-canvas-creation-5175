-- Allow NULL company_id for "custom" (egendefinert) scenarios
ALTER TABLE public.revenue_calculator_scenarios ALTER COLUMN company_id DROP NOT NULL;

-- Drop unique constraint if it exists on company_id and recreate to allow nulls properly
-- First check existing constraints
DO $$
BEGIN
  -- Drop existing unique constraint on company_id if any
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'revenue_calculator_scenarios_company_id_key') THEN
    ALTER TABLE public.revenue_calculator_scenarios DROP CONSTRAINT revenue_calculator_scenarios_company_id_key;
  END IF;
END $$;

-- Create a unique index that handles NULL company_id with updated_by as discriminator
CREATE UNIQUE INDEX IF NOT EXISTS uq_revenue_calc_company_user 
  ON public.revenue_calculator_scenarios (COALESCE(company_id, '00000000-0000-0000-0000-000000000000'::uuid), COALESCE(updated_by, '00000000-0000-0000-0000-000000000000'::uuid));