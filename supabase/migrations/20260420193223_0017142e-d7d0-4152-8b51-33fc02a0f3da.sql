-- Add propagation flag for SORA-based approval
ALTER TABLE public.companies
ADD COLUMN IF NOT EXISTS propagate_sora_approval boolean NOT NULL DEFAULT false;

-- RPC: returns the effective sora-approval config (parent's if propagated, else own)
CREATE OR REPLACE FUNCTION public.get_effective_sora_approval_config(_company_id uuid)
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
  _config jsonb;
BEGIN
  -- Access check
  IF NOT (_company_id = ANY (public.get_user_visible_company_ids(auth.uid()))) THEN
    RAISE EXCEPTION 'Access denied to company %', _company_id;
  END IF;

  SELECT c.parent_company_id, p.propagate_sora_approval
    INTO _parent_id, _propagate
  FROM public.companies c
  LEFT JOIN public.companies p ON p.id = c.parent_company_id
  WHERE c.id = _company_id;

  IF _parent_id IS NOT NULL AND COALESCE(_propagate, false) THEN
    _effective_id := _parent_id;
  ELSE
    _effective_id := _company_id;
  END IF;

  SELECT to_jsonb(csc.*) INTO _config
  FROM public.company_sora_config csc
  WHERE csc.company_id = _effective_id;

  RETURN jsonb_build_object(
    'effective_company_id', _effective_id,
    'inherited', _effective_id <> _company_id,
    'config', COALESCE(_config, '{}'::jsonb)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_effective_sora_approval_config(uuid) TO authenticated;