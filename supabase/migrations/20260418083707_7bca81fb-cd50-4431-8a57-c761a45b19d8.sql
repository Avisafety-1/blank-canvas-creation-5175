-- Add SafeSky callsign customization columns
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS safesky_callsign_prefix text,
  ADD COLUMN IF NOT EXISTS safesky_callsign_variable text NOT NULL DEFAULT 'counter',
  ADD COLUMN IF NOT EXISTS safesky_callsign_propagate boolean NOT NULL DEFAULT false;

-- Constrain variable values
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'companies_safesky_callsign_variable_check'
  ) THEN
    ALTER TABLE public.companies
      ADD CONSTRAINT companies_safesky_callsign_variable_check
      CHECK (safesky_callsign_variable IN ('counter','drone_registration'));
  END IF;
END$$;

-- Extend propagate_company_settings trigger to also propagate callsign settings
CREATE OR REPLACE FUNCTION public.propagate_company_settings()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Existing behavior preserved for other propagated fields (handled by their own triggers if any).
  -- Propagate SafeSky callsign settings to all child companies when toggle is on
  IF NEW.safesky_callsign_propagate IS TRUE AND (
    TG_OP = 'INSERT' OR
    NEW.safesky_callsign_prefix IS DISTINCT FROM OLD.safesky_callsign_prefix OR
    NEW.safesky_callsign_variable IS DISTINCT FROM OLD.safesky_callsign_variable OR
    NEW.safesky_callsign_propagate IS DISTINCT FROM OLD.safesky_callsign_propagate
  ) THEN
    UPDATE public.companies
    SET
      safesky_callsign_prefix = NEW.safesky_callsign_prefix,
      safesky_callsign_variable = NEW.safesky_callsign_variable
    WHERE parent_company_id = NEW.id;
  END IF;

  RETURN NEW;
END;
$$;

-- Ensure trigger exists
DROP TRIGGER IF EXISTS trg_propagate_company_settings ON public.companies;
CREATE TRIGGER trg_propagate_company_settings
AFTER INSERT OR UPDATE ON public.companies
FOR EACH ROW
EXECUTE FUNCTION public.propagate_company_settings();