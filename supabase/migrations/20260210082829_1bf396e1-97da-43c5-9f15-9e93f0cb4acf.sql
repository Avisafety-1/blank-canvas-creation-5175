
CREATE OR REPLACE FUNCTION public.auto_assign_admin_on_approval()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF (OLD.approved IS DISTINCT FROM true AND NEW.approved = true) THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'admin')
    ON CONFLICT (user_id) DO UPDATE SET role = 'admin';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trigger_auto_assign_admin_on_approval
  AFTER UPDATE OF approved ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_assign_admin_on_approval();
