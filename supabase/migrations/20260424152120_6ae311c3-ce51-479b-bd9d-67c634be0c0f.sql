-- Add column to store SN mismatch suggestions for user confirmation
ALTER TABLE public.pending_dji_logs
ADD COLUMN IF NOT EXISTS sn_mismatch_suggestion jsonb;

-- One-time rematch: try to match existing pending logs to drones via prefix
-- when the stored serial number is a truncated 16-char version of the full SN.
DO $$
DECLARE
  pending_rec RECORD;
  matched_drone RECORD;
BEGIN
  FOR pending_rec IN
    SELECT id, company_id, aircraft_sn, matched_drone_id
    FROM public.pending_dji_logs
    WHERE status = 'pending'
      AND aircraft_sn IS NOT NULL
      AND aircraft_sn <> ''
  LOOP
    -- Find a drone where the stored 16-char SN is a prefix of the new full SN,
    -- or where the stored SN equals the pending SN (already correct).
    SELECT id, serienummer INTO matched_drone
    FROM public.drones
    WHERE company_id = pending_rec.company_id
      AND serienummer IS NOT NULL
      AND serienummer <> ''
      AND (
        serienummer = pending_rec.aircraft_sn
        OR (length(serienummer) = 16 AND pending_rec.aircraft_sn LIKE serienummer || '%')
        OR (length(pending_rec.aircraft_sn) = 16 AND serienummer LIKE pending_rec.aircraft_sn || '%')
      )
    LIMIT 1;

    IF matched_drone.id IS NOT NULL THEN
      -- Update matched_drone_id if missing
      IF pending_rec.matched_drone_id IS NULL THEN
        UPDATE public.pending_dji_logs
        SET matched_drone_id = matched_drone.id
        WHERE id = pending_rec.id;
      END IF;

      -- If serial numbers differ, store suggestion for user confirmation
      IF matched_drone.serienummer <> pending_rec.aircraft_sn THEN
        UPDATE public.pending_dji_logs
        SET sn_mismatch_suggestion = jsonb_build_object(
          'drone_id', matched_drone.id,
          'current_sn', matched_drone.serienummer,
          'suggested_sn', pending_rec.aircraft_sn,
          'type', 'drone'
        )
        WHERE id = pending_rec.id;
      END IF;
    END IF;
  END LOOP;
END $$;