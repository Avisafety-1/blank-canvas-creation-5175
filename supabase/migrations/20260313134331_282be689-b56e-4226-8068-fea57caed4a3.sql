-- Oppdater godkjennings-trigger: godkjente brukere får standardrolle 'bruker'
CREATE OR REPLACE FUNCTION public.auto_assign_admin_on_approval()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF (OLD.approved IS DISTINCT FROM true AND NEW.approved = true) THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'bruker')
    ON CONFLICT (user_id) DO UPDATE SET role = 'bruker';
  END IF;
  RETURN NEW;
END;
$function$;

-- Oppdater registrerings-trigger: nye profiler får standardrolle 'bruker'
CREATE OR REPLACE FUNCTION public.handle_new_profile_role()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM user_roles WHERE user_id = NEW.id) THEN
    INSERT INTO user_roles (user_id, role) VALUES (NEW.id, 'bruker');
  END IF;
  RETURN NEW;
END;
$function$;

-- Oppdater eksisterende admin-policyer for vedlegg til også å støtte 'administrator'
DROP POLICY IF EXISTS "Admins can insert attachments" ON public.email_template_attachments;
CREATE POLICY "Admins can insert attachments"
ON public.email_template_attachments
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM user_roles ur
    WHERE ur.user_id = auth.uid()
      AND ur.role = ANY (ARRAY['admin'::app_role, 'administrator'::app_role, 'superadmin'::app_role])
  )
);

DROP POLICY IF EXISTS "Admins can delete attachments" ON public.email_template_attachments;
CREATE POLICY "Admins can delete attachments"
ON public.email_template_attachments
FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM user_roles ur
    WHERE ur.user_id = auth.uid()
      AND ur.role = ANY (ARRAY['admin'::app_role, 'administrator'::app_role, 'superadmin'::app_role])
  )
);