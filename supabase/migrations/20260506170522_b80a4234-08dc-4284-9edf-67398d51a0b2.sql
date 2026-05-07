-- Del A: Fjern redundante service-role policies (service role bypasser RLS uansett)
DROP POLICY IF EXISTS "Service role can insert campaigns"      ON public.bulk_email_campaigns;
DROP POLICY IF EXISTS "Service role can update campaigns"      ON public.bulk_email_campaigns;
DROP POLICY IF EXISTS "Service role can manage beacons"        ON public.safesky_beacons;
DROP POLICY IF EXISTS "Service role can insert terrain cache"  ON public.terrain_elevation_cache;

-- Del B: Lås search_path på 5 funksjoner
ALTER FUNCTION public.update_drone_flight_hours()          SET search_path = public;
ALTER FUNCTION public.update_equipment_flight_hours()      SET search_path = public;
ALTER FUNCTION public.sync_user_companies_on_role_change() SET search_path = public;
ALTER FUNCTION public.set_updated_at()                     SET search_path = public;
ALTER FUNCTION public.set_dronetag_devices_updated_at()    SET search_path = public;