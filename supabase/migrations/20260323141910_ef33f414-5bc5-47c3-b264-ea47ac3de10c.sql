-- Trigger-funksjon for auto-sync av user_companies ved rolletildeling
CREATE OR REPLACE FUNCTION sync_user_companies_on_role_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_company_id uuid;
BEGIN
  IF NEW.role NOT IN ('administrator', 'superadmin') THEN
    RETURN NEW;
  END IF;

  SELECT company_id INTO v_company_id
  FROM profiles WHERE id = NEW.user_id;

  IF v_company_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF EXISTS (
    SELECT 1 FROM companies 
    WHERE parent_company_id = v_company_id
  ) THEN
    INSERT INTO user_companies (user_id, company_id)
    VALUES (NEW.user_id, v_company_id)
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

-- Trigger på user_roles
CREATE TRIGGER on_role_change_sync_user_companies
AFTER INSERT OR UPDATE ON user_roles
FOR EACH ROW
EXECUTE FUNCTION sync_user_companies_on_role_change();

-- Backfill eksisterende administratorer i selskaper med avdelinger
INSERT INTO user_companies (user_id, company_id)
SELECT p.id, p.company_id
FROM profiles p
JOIN user_roles ur ON ur.user_id = p.id
WHERE ur.role IN ('administrator', 'superadmin')
  AND p.company_id IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM companies 
    WHERE parent_company_id = p.company_id
  )
  AND NOT EXISTS (
    SELECT 1 FROM user_companies uc 
    WHERE uc.user_id = p.id AND uc.company_id = p.company_id
  )
ON CONFLICT DO NOTHING;