-- Rydd opp legacy roller: konverter 'admin' til 'administrator'
UPDATE public.user_roles
SET role = 'administrator'
WHERE role::text = 'admin';