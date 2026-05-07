
-- Trigger: Auto-update drone flight hours when a flight_log is inserted
CREATE OR REPLACE FUNCTION public.update_drone_flight_hours_on_log()
RETURNS trigger AS $$
BEGIN
  IF NEW.drone_id IS NOT NULL THEN
    UPDATE public.drones 
    SET flyvetimer = COALESCE(flyvetimer, 0) + NEW.flight_duration_minutes
    WHERE id = NEW.drone_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER trg_update_drone_hours
  AFTER INSERT ON public.flight_logs
  FOR EACH ROW
  EXECUTE FUNCTION public.update_drone_flight_hours_on_log();

-- Trigger: Auto-update equipment flight hours when flight_log_equipment is inserted
CREATE OR REPLACE FUNCTION public.update_equipment_flight_hours_on_log()
RETURNS trigger AS $$
DECLARE
  v_duration integer;
BEGIN
  -- Get the flight duration from the parent flight_log
  SELECT flight_duration_minutes INTO v_duration
  FROM public.flight_logs
  WHERE id = NEW.flight_log_id;
  
  IF v_duration IS NOT NULL THEN
    UPDATE public.equipment
    SET flyvetimer = COALESCE(flyvetimer, 0) + v_duration
    WHERE id = NEW.equipment_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER trg_update_equipment_hours
  AFTER INSERT ON public.flight_log_equipment
  FOR EACH ROW
  EXECUTE FUNCTION public.update_equipment_flight_hours_on_log();
