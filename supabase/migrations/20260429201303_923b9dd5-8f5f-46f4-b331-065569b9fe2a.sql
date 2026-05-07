CREATE OR REPLACE FUNCTION public.sync_training_assignment_unlocked_modules()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  modules_to_unlock text[];
  all_modules constant text[] := ARRAY['missions','map','documents','calendar','incidents','status','resources'];
  unlocks_all_modules boolean := false;
BEGIN
  IF NEW.passed IS DISTINCT FROM true THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.passed IS NOT DISTINCT FROM NEW.passed THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(unlocks_modules, '{}'::text[])
  INTO modules_to_unlock
  FROM public.training_courses
  WHERE id = NEW.course_id;

  modules_to_unlock := COALESCE(modules_to_unlock, '{}'::text[]);

  IF array_length(modules_to_unlock, 1) IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT NOT EXISTS (
    SELECT 1
    FROM unnest(all_modules) AS required_module(module_key)
    WHERE required_module.module_key <> ALL(modules_to_unlock)
  )
  INTO unlocks_all_modules;

  IF unlocks_all_modules THEN
    UPDATE public.profiles p
    SET under_training = false,
        training_module_access = '{}'::text[],
        updated_at = now()
    WHERE p.id = NEW.profile_id;
  ELSE
    UPDATE public.profiles p
    SET training_module_access = ARRAY(
          SELECT DISTINCT module_key
          FROM unnest(COALESCE(p.training_module_access, '{}'::text[]) || modules_to_unlock) AS module_key
          WHERE public.validate_training_module_keys(ARRAY[module_key])
        ),
        updated_at = now()
    WHERE p.id = NEW.profile_id;
  END IF;

  RETURN NEW;
END;
$$;