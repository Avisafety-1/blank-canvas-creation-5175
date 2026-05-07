UPDATE public.user_roles ur
SET role = 'superadmin'::public.app_role
FROM auth.users u
WHERE ur.user_id = u.id AND u.email = 'superadmin@pentest.test';

UPDATE public.user_roles ur
SET role = 'admin'::public.app_role
FROM auth.users u
WHERE ur.user_id = u.id AND u.email IN ('admin-a@pentest.test', 'admin-b@pentest.test');