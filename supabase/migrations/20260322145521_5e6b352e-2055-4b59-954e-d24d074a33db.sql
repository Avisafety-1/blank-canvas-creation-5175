-- Trigger function: propagate integration settings from parent to children
CREATE OR REPLACE FUNCTION propagate_company_settings()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM companies WHERE parent_company_id = NEW.id) THEN
    IF (OLD.dji_flightlog_enabled IS DISTINCT FROM NEW.dji_flightlog_enabled
        OR OLD.dji_auto_sync_enabled IS DISTINCT FROM NEW.dji_auto_sync_enabled
        OR OLD.dji_sync_from_date IS DISTINCT FROM NEW.dji_sync_from_date
        OR OLD.dronelog_api_key IS DISTINCT FROM NEW.dronelog_api_key
        OR OLD.eccairs_enabled IS DISTINCT FROM NEW.eccairs_enabled
        OR OLD.dronetag_enabled IS DISTINCT FROM NEW.dronetag_enabled)
    THEN
      UPDATE companies
      SET
        dji_flightlog_enabled = NEW.dji_flightlog_enabled,
        dji_auto_sync_enabled = NEW.dji_auto_sync_enabled,
        dji_sync_from_date = NEW.dji_sync_from_date,
        dronelog_api_key = NEW.dronelog_api_key,
        eccairs_enabled = NEW.eccairs_enabled,
        dronetag_enabled = NEW.dronetag_enabled
      WHERE parent_company_id = NEW.id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_propagate_company_settings ON companies;
CREATE TRIGGER trg_propagate_company_settings
  AFTER UPDATE ON companies
  FOR EACH ROW
  EXECUTE FUNCTION propagate_company_settings();

UPDATE companies AS child
SET
  dji_flightlog_enabled = parent.dji_flightlog_enabled,
  dji_auto_sync_enabled = parent.dji_auto_sync_enabled,
  dji_sync_from_date = parent.dji_sync_from_date,
  dronelog_api_key = parent.dronelog_api_key,
  eccairs_enabled = parent.eccairs_enabled,
  dronetag_enabled = parent.dronetag_enabled
FROM companies AS parent
WHERE child.parent_company_id = parent.id;