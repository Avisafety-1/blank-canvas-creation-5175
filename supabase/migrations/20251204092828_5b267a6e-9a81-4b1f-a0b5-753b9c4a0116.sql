-- Legg til registration_code kolonne
ALTER TABLE public.companies 
ADD COLUMN IF NOT EXISTS registration_code TEXT UNIQUE;

-- Generer unike koder for eksisterende selskaper (6 tegn, store bokstaver og tall)
UPDATE public.companies 
SET registration_code = UPPER(SUBSTRING(MD5(id::text || random()::text) FROM 1 FOR 6))
WHERE registration_code IS NULL;

-- Gjør kolonnen NOT NULL
ALTER TABLE public.companies 
ALTER COLUMN registration_code SET NOT NULL;

-- Funksjon for automatisk kode-generering
CREATE OR REPLACE FUNCTION public.generate_registration_code()
RETURNS TRIGGER AS $$
DECLARE
  new_code TEXT;
  code_exists BOOLEAN;
BEGIN
  IF NEW.registration_code IS NULL THEN
    LOOP
      new_code := UPPER(SUBSTRING(MD5(gen_random_uuid()::text) FROM 1 FOR 6));
      SELECT EXISTS(SELECT 1 FROM public.companies WHERE registration_code = new_code) INTO code_exists;
      EXIT WHEN NOT code_exists;
    END LOOP;
    NEW.registration_code := new_code;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Trigger for nye selskaper
DROP TRIGGER IF EXISTS set_registration_code ON public.companies;
CREATE TRIGGER set_registration_code
BEFORE INSERT ON public.companies
FOR EACH ROW
EXECUTE FUNCTION public.generate_registration_code();

-- Fjern den usikre RLS-policyen som lar anonyme brukere se selskaper
DROP POLICY IF EXISTS "Anonymous users can view active companies for signup" ON public.companies;

-- RPC-funksjon for å validere registreringskode (tilgjengelig for alle, inkl. anonyme)
CREATE OR REPLACE FUNCTION public.get_company_by_registration_code(p_code TEXT)
RETURNS TABLE (company_id UUID, company_name TEXT) AS $$
BEGIN
  RETURN QUERY
  SELECT id, navn 
  FROM public.companies 
  WHERE UPPER(registration_code) = UPPER(p_code) 
    AND aktiv = true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;