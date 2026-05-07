CREATE OR REPLACE FUNCTION update_drone_flight_hours()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.drone_id IS NOT NULL THEN
    UPDATE drones
    SET flyvetimer = COALESCE(flyvetimer, 0) + NEW.flight_duration_minutes / 60.0
    WHERE id = NEW.drone_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION update_equipment_flight_hours()
RETURNS TRIGGER AS $$
DECLARE
  v_duration numeric;
BEGIN
  SELECT flight_duration_minutes INTO v_duration
  FROM flight_logs
  WHERE id = NEW.flight_log_id;

  IF v_duration IS NOT NULL THEN
    UPDATE equipment
    SET flyvetimer = COALESCE(flyvetimer, 0) + v_duration / 60.0
    WHERE id = NEW.equipment_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;