CREATE INDEX IF NOT EXISTS idx_missions_company_approval_submitted
  ON public.missions (company_id, approval_status, submitted_for_approval_at DESC);

CREATE INDEX IF NOT EXISTS idx_equipment_active_created
  ON public.equipment (aktiv, opprettet_dato DESC);

CREATE INDEX IF NOT EXISTS idx_drones_active_created
  ON public.drones (aktiv, opprettet_dato DESC);

CREATE INDEX IF NOT EXISTS idx_drone_personnel_drone_id
  ON public.drone_personnel (drone_id);

ALTER PUBLICATION supabase_realtime DROP TABLE public.map_viewer_heartbeats;