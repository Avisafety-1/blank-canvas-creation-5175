ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS under_training boolean NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS training_module_access text[] NOT NULL DEFAULT '{}'::text[];

ALTER TABLE public.training_courses
ADD COLUMN IF NOT EXISTS unlocks_modules text[] NOT NULL DEFAULT '{}'::text[];

CREATE OR REPLACE FUNCTION public.validate_training_module_keys(_modules text[])
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT bool_and(module_key = ANY (ARRAY['missions','map','documents','calendar','incidents','status','resources']))
     FROM unnest(COALESCE(_modules, '{}'::text[])) AS module_key),
    true
  );
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'profiles_training_module_access_valid'
  ) THEN
    ALTER TABLE public.profiles
    ADD CONSTRAINT profiles_training_module_access_valid
    CHECK (public.validate_training_module_keys(training_module_access));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'training_courses_unlocks_modules_valid'
  ) THEN
    ALTER TABLE public.training_courses
    ADD CONSTRAINT training_courses_unlocks_modules_valid
    CHECK (public.validate_training_module_keys(unlocks_modules));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_profiles_under_training
ON public.profiles (under_training)
WHERE under_training = true;

CREATE INDEX IF NOT EXISTS idx_profiles_training_module_access
ON public.profiles USING gin (training_module_access);

CREATE INDEX IF NOT EXISTS idx_training_courses_unlocks_modules
ON public.training_courses USING gin (unlocks_modules);