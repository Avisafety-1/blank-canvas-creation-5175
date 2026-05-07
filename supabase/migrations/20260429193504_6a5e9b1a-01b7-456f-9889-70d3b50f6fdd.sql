UPDATE public.profiles
SET training_module_access = '{}'::text[]
WHERE under_training = false
  AND cardinality(training_module_access) > 0;