CREATE OR REPLACE FUNCTION sync_user_companies_on_company_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF OLD.company_id IS NOT DISTINCT FROM NEW.company_id THEN
    RETURN NEW;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM user_roles 
    WHERE user_id = NEW.id 
      AND role IN ('administrator', 'superadmin')
  ) THEN
    RETURN NEW;
  END IF;

  IF OLD.company_id IS NOT NULL THEN
    DELETE FROM user_companies 
    WHERE user_id = NEW.id 
      AND company_id = OLD.company_id;
  END IF;

  IF NEW.company_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM companies 
    WHERE parent_company_id = NEW.company_id
  ) THEN
    INSERT INTO user_companies (user_id, company_id)
    VALUES (NEW.id, NEW.company_id)
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER on_profile_company_change_sync
AFTER UPDATE OF company_id ON profiles
FOR EACH ROW
EXECUTE FUNCTION sync_user_companies_on_company_change();