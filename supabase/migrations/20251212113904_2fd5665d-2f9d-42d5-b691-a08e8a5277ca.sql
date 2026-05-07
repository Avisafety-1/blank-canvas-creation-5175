-- Policy som tillater autentiserte brukere å se missions som har aktive flyturer
-- Dette er nødvendig for at advisory-områder skal vises på tvers av selskaper
CREATE POLICY "Authenticated users can view missions with active flights" 
  ON missions 
  FOR SELECT 
  USING (
    auth.uid() IS NOT NULL 
    AND id IN (
      SELECT mission_id FROM active_flights WHERE mission_id IS NOT NULL
    )
  );