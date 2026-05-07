-- One-time cleanup: mark pending_dji_logs as approved where the SHA-256 already exists in flight_logs
UPDATE pending_dji_logs p
SET status = 'approved',
    processed_flight_log_id = f.id
FROM flight_logs f
WHERE p.status = 'pending'
  AND f.company_id = p.company_id
  AND f.dronelog_sha256 = (p.parsed_result->>'sha256Hash')
  AND f.dronelog_sha256 IS NOT NULL;