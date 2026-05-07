UPDATE public.pending_dji_logs
SET status = 'unsupported',
    error_code = 'unsupported_format',
    error_message = 'Loggen kan ikke parses automatisk fra DJI Cloud. Last opp .txt manuelt fra dronen.',
    last_error_at = now()
WHERE status = 'pending'
  AND aircraft_name IS NULL
  AND parsed_result IS NULL
  AND error_code IS NULL;