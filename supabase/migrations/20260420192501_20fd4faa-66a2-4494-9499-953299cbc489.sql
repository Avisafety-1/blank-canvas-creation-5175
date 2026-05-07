CREATE OR REPLACE FUNCTION public.get_effective_flight_alert_config(_company_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _parent_id uuid;
  _propagate boolean;
  _effective_id uuid;
  _alerts jsonb;
  _recipients uuid[];
BEGIN
  -- Access control: caller must have visibility of this company
  IF NOT (_company_id = ANY(public.get_user_visible_company_ids(auth.uid()))) THEN
    RAISE EXCEPTION 'Access denied to company %', _company_id;
  END IF;

  SELECT c.parent_company_id INTO _parent_id
  FROM public.companies c WHERE c.id = _company_id;

  IF _parent_id IS NOT NULL THEN
    SELECT p.propagate_flight_alerts INTO _propagate
    FROM public.companies p WHERE p.id = _parent_id;
    IF COALESCE(_propagate, false) THEN
      _effective_id := _parent_id;
    ELSE
      _effective_id := _company_id;
    END IF;
  ELSE
    _effective_id := _company_id;
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'alert_type', alert_type,
    'enabled', enabled,
    'threshold_value', threshold_value
  )), '[]'::jsonb) INTO _alerts
  FROM public.company_flight_alerts
  WHERE company_id = _effective_id;

  SELECT COALESCE(array_agg(profile_id), ARRAY[]::uuid[]) INTO _recipients
  FROM public.company_flight_alert_recipients
  WHERE company_id = _effective_id;

  RETURN jsonb_build_object(
    'effective_company_id', _effective_id,
    'alerts', _alerts,
    'recipient_profile_ids', to_jsonb(_recipients)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_effective_flight_alert_config(uuid) TO authenticated;