-- Runde 3: Lås ned SECURITY DEFINER-funksjoner

-- A: Frontend RPC-er - fjern anon, behold authenticated
REVOKE EXECUTE ON FUNCTION public.can_user_access_company(uuid, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.check_mission_airspace(double precision, double precision, jsonb) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_ai_risk_eta_ms() FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_incident_responsible_users(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_naturvern_in_bounds(double precision, double precision, double precision, double precision) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_user_accessible_companies(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_user_visible_company_ids(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_vern_restrictions_in_bounds(double precision, double precision, double precision, double precision) FROM anon;
REVOKE EXECUTE ON FUNCTION public.update_eccairs_credentials(uuid, text, text, text, text, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.update_email_settings(uuid, text, integer, text, text, boolean, text, text, boolean) FROM anon;

-- C: RLS-hjelpere - fjern anon, behold authenticated
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role) FROM anon;
REVOKE EXECUTE ON FUNCTION public.is_superadmin(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_user_role(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_user_company_id(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_parent_company_id(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_user_readable_company_ids(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_user_incident_visible_company_ids(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.can_read_folder(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_effective_parent_company_id(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_effective_deviation_categories(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_effective_flight_alert_config(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_effective_sora_approval_config(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.has_effective_deviation_categories(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.check_mission_zone_conflicts(double precision, double precision) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_mission_approvers(uuid) FROM anon;

-- D: Edge-only / admin-jobber - fjern både anon og authenticated
REVOKE EXECUTE ON FUNCTION public.bulk_upsert_geojson_features(text, jsonb) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.bulk_upsert_naturvern_zones(jsonb) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.bulk_upsert_vern_restrictions(jsonb) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.upsert_geojson_feature(text, text, text, text, text, jsonb) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.upsert_naturvern_zone(text, text, text, text, jsonb) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.upsert_vern_restriction(text, text, text, text, jsonb) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.upsert_openaip_airspace(text, text, text, text, text, text, text, text, text) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_eccairs_credentials(uuid, text) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_fh2_token(uuid, text) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.save_fh2_token(uuid, text, text) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_linkedin_token(uuid, text) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.upsert_linkedin_token(uuid, text, text, text, timestamp with time zone, text) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_platform_statistics(uuid) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.match_manual_chunks(uuid, vector, integer) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.add_drone_flight_hours(uuid, integer) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.add_equipment_flight_hours(uuid, integer) FROM anon, authenticated;