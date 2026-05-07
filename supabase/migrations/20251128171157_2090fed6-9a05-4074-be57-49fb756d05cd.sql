-- Add email column to profiles table
ALTER TABLE public.profiles
ADD COLUMN email TEXT;

-- Update the handle_new_user trigger to also copy email
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, company_id, email)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    COALESCE((NEW.raw_user_meta_data->>'company_id')::uuid, '11111111-1111-1111-1111-111111111111'),
    NEW.email
  );
  RETURN NEW;
END;
$$;