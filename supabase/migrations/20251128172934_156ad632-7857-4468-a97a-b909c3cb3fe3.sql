-- Update the handle_new_user trigger to automatically assign 'lesetilgang' role to new users
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Create profile
  INSERT INTO public.profiles (id, full_name, company_id, email)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    COALESCE((NEW.raw_user_meta_data->>'company_id')::uuid, '11111111-1111-1111-1111-111111111111'),
    NEW.email
  );
  
  -- Assign default role 'lesetilgang' to new user
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'lesetilgang');
  
  RETURN NEW;
END;
$$;

-- Give existing users without a role the 'lesetilgang' role
INSERT INTO public.user_roles (user_id, role)
SELECT p.id, 'lesetilgang'
FROM public.profiles p
WHERE NOT EXISTS (
  SELECT 1 FROM public.user_roles ur WHERE ur.user_id = p.id
);