
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_company_id uuid;
BEGIN
  -- Branch 1: New company registration (via user metadata)
  IF NEW.raw_user_meta_data->>'new_company_name' IS NOT NULL THEN
    INSERT INTO public.companies (navn, org_nummer)
    VALUES (
      NEW.raw_user_meta_data->>'new_company_name',
      NULLIF(TRIM(COALESCE(NEW.raw_user_meta_data->>'new_company_org_nr', '')), '')
    )
    RETURNING id INTO v_company_id;

    INSERT INTO public.profiles (id, full_name, company_id, email, approved)
    VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name',''), v_company_id, NEW.email, true);

    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'administrator');

  -- Branch 2: Existing company with registration code (unchanged)
  ELSIF NEW.raw_user_meta_data->>'company_id' IS NOT NULL THEN
    INSERT INTO public.profiles (id, full_name, company_id, email, approved)
    VALUES (
      NEW.id,
      COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
      (NEW.raw_user_meta_data->>'company_id')::uuid,
      NEW.email,
      false
    );
  END IF;
  RETURN NEW;
END;
$$;
