-- Change flyvetimer columns from integer to numeric for decimal support
ALTER TABLE drones ALTER COLUMN flyvetimer TYPE numeric(10,2) USING flyvetimer::numeric(10,2);
ALTER TABLE drones ALTER COLUMN flyvetimer SET DEFAULT 0;

ALTER TABLE equipment ALTER COLUMN flyvetimer TYPE numeric(10,2) USING flyvetimer::numeric(10,2);
ALTER TABLE equipment ALTER COLUMN flyvetimer SET DEFAULT 0;

-- Update functions to use decimal calculations
CREATE OR REPLACE FUNCTION public.add_drone_flight_hours(
  p_drone_id UUID,
  p_minutes INTEGER
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company_id UUID;
  v_user_company_id UUID;
BEGIN
  SELECT company_id INTO v_company_id FROM drones WHERE id = p_drone_id;
  v_user_company_id := get_user_company_id(auth.uid());
  
  IF v_company_id IS NULL OR v_company_id != v_user_company_id THEN
    RAISE EXCEPTION 'Access denied: drone not in your company';
  END IF;
  
  -- Update with decimal precision (minutes / 60)
  UPDATE drones 
  SET flyvetimer = flyvetimer + (p_minutes::numeric / 60)
  WHERE id = p_drone_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.add_equipment_flight_hours(
  p_equipment_id UUID,
  p_minutes INTEGER
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company_id UUID;
  v_user_company_id UUID;
BEGIN
  SELECT company_id INTO v_company_id FROM equipment WHERE id = p_equipment_id;
  v_user_company_id := get_user_company_id(auth.uid());
  
  IF v_company_id IS NULL OR v_company_id != v_user_company_id THEN
    RAISE EXCEPTION 'Access denied: equipment not in your company';
  END IF;
  
  -- Update with decimal precision (minutes / 60)
  UPDATE equipment 
  SET flyvetimer = flyvetimer + (p_minutes::numeric / 60)
  WHERE id = p_equipment_id;
END;
$$;