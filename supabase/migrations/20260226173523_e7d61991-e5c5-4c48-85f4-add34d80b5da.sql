-- Update handle_new_user to assign 'administrator' role to new users
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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

    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'administrator');
  END IF;

  RETURN NEW;
END;
$$;

-- Upgrade existing users with legacy/low roles to administrator
-- (skip superadmin users)
UPDATE public.user_roles
SET role = 'administrator'
WHERE role IN ('lesetilgang', 'bruker', 'saksbehandler', 'operatør')
  AND user_id NOT IN (
    SELECT user_id FROM public.user_roles WHERE role = 'superadmin'
  );