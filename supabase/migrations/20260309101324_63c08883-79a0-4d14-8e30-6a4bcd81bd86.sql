
-- Make user_id / profile_id columns nullable where they currently are NOT NULL
-- so that admin-delete-user can SET NULL instead of deleting rows.

-- Tables with user_id NOT NULL that need to become nullable:
ALTER TABLE public.drones ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE public.equipment ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE public.flight_logs ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE public.missions ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE public.incidents ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE public.documents ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE public.news ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE public.calendar_events ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE public.drone_accessories ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE public.drone_inspections ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE public.drone_log_entries ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE public.drone_equipment_history ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE public.equipment_log_entries ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE public.incident_comments ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE public.dji_credentials ALTER COLUMN user_id DROP NOT NULL;
