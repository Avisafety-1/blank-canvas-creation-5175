CREATE OR REPLACE FUNCTION public.sync_training_assignment_unlocked_modules()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  modules_to_unlock text[];
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

  UPDATE public.profiles p
  SET training_module_access = ARRAY(
        SELECT DISTINCT module_key
        FROM unnest(COALESCE(p.training_module_access, '{}'::text[]) || modules_to_unlock) AS module_key
        WHERE public.validate_training_module_keys(ARRAY[module_key])
      ),
      updated_at = now()
  WHERE p.id = NEW.profile_id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_training_assignment_unlocked_modules ON public.training_assignments;

CREATE TRIGGER trg_sync_training_assignment_unlocked_modules
AFTER INSERT OR UPDATE OF passed ON public.training_assignments
FOR EACH ROW
WHEN (NEW.passed = true)
EXECUTE FUNCTION public.sync_training_assignment_unlocked_modules();