-- Create function to update drone flight hours (bypasses RLS for this specific operation)
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
  -- Get the drone's company_id
  SELECT company_id INTO v_company_id FROM drones WHERE id = p_drone_id;
  
  -- Get the user's company_id
  v_user_company_id := get_user_company_id(auth.uid());
  
  -- Verify user is in the same company as the drone
  IF v_company_id IS NULL OR v_company_id != v_user_company_id THEN
    RAISE EXCEPTION 'Access denied: drone not in your company';
  END IF;
  
  -- Update the drone's flight hours (convert minutes to hours, rounding)
  UPDATE drones 
  SET flyvetimer = flyvetimer + ROUND(p_minutes::numeric / 60)
  WHERE id = p_drone_id;
END;
$$;

-- Create function to update equipment flight hours (bypasses RLS for this specific operation)
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
  -- Get the equipment's company_id
  SELECT company_id INTO v_company_id FROM equipment WHERE id = p_equipment_id;
  
  -- Get the user's company_id
  v_user_company_id := get_user_company_id(auth.uid());
  
  -- Verify user is in the same company as the equipment
  IF v_company_id IS NULL OR v_company_id != v_user_company_id THEN
    RAISE EXCEPTION 'Access denied: equipment not in your company';
  END IF;
  
  -- Update the equipment's flight hours (convert minutes to hours, rounding)
  UPDATE equipment 
  SET flyvetimer = flyvetimer + ROUND(p_minutes::numeric / 60)
  WHERE id = p_equipment_id;
END;
$$;

-- Grant execute permissions to authenticated users
GRANT EXECUTE ON FUNCTION public.add_drone_flight_hours(UUID, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.add_equipment_flight_hours(UUID, INTEGER) TO authenticated;