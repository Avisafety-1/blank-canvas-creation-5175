CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.raw_user_meta_data->>'company_id' IS NOT NULL THEN
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