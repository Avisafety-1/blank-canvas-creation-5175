CREATE OR REPLACE FUNCTION public.get_effective_deviation_categories(_company_id uuid)
RETURNS SETOF public.deviation_report_categories
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _parent_id uuid;
  _propagate boolean;
  _effective_id uuid;
BEGIN
  -- Access check: caller must be able to see this company
  IF NOT (_company_id = ANY(public.get_user_visible_company_ids(auth.uid()))) THEN
    RAISE EXCEPTION 'Access denied to company %', _company_id;
  END IF;

  -- Look up parent and propagate flag
  SELECT c.parent_company_id INTO _parent_id
  FROM public.companies c
  WHERE c.id = _company_id;

  IF _parent_id IS NOT NULL THEN
    SELECT p.propagate_deviation_report INTO _propagate
    FROM public.companies p
    WHERE p.id = _parent_id;

    IF COALESCE(_propagate, false) THEN
      _effective_id := _parent_id;
    ELSE
      _effective_id := _company_id;
    END IF;
  ELSE
    _effective_id := _company_id;
  END IF;

  RETURN QUERY
  SELECT * FROM public.deviation_report_categories
  WHERE company_id = _effective_id
  ORDER BY sort_order, label;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_effective_deviation_categories(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.has_effective_deviation_categories(_company_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.get_effective_deviation_categories(_company_id)
  );
$$;

GRANT EXECUTE ON FUNCTION public.has_effective_deviation_categories(uuid) TO authenticated;