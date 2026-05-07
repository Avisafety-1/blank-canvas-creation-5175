
-- 1. Replace drone trigger to use the corrected function (divides by 60.0)
DROP TRIGGER IF EXISTS trg_update_drone_hours ON flight_logs;
CREATE TRIGGER trg_update_drone_hours
  AFTER INSERT ON flight_logs
  FOR EACH ROW
  EXECUTE FUNCTION update_drone_flight_hours();

-- 2. Replace equipment trigger to use the corrected function
DROP TRIGGER IF EXISTS trg_update_equipment_hours ON flight_log_equipment;
CREATE TRIGGER trg_update_equipment_hours
  AFTER INSERT ON flight_log_equipment
  FOR EACH ROW
  EXECUTE FUNCTION update_equipment_flight_hours();

-- 3. Recalculate all drone flight hours from actual logs
UPDATE drones d
SET flyvetimer = COALESCE(sub.total, 0)
FROM (
  SELECT drone_id, SUM(flight_duration_minutes) / 60.0 AS total
  FROM flight_logs
  WHERE drone_id IS NOT NULL
  GROUP BY drone_id
) sub
WHERE d.id = sub.drone_id;

-- 4. Recalculate all equipment flight hours from actual logs
UPDATE equipment e
SET flyvetimer = COALESCE(sub.total, 0)
FROM (
  SELECT fle.equipment_id, SUM(fl.flight_duration_minutes) / 60.0 AS total
  FROM flight_log_equipment fle
  JOIN flight_logs fl ON fl.id = fle.flight_log_id
  GROUP BY fle.equipment_id
) sub
WHERE e.id = sub.equipment_id;
