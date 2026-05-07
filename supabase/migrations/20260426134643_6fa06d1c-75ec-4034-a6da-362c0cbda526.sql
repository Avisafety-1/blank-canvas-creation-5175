-- Tighten retention for Supabase cron and pg_net technical logs.
-- These tables store operational job history / HTTP responses only, not application data.

-- One-time cleanup of historical cron job details older than 24 hours.
DELETE FROM cron.job_run_details
WHERE end_time < now() - interval '24 hours';

-- One-time cleanup of pg_net HTTP responses older than 1 hour.
DELETE FROM net._http_response
WHERE created < now() - interval '1 hour';

-- Replace existing cleanup job with a combined cleanup for both cron and pg_net logs.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'cleanup-cron-logs') THEN
    PERFORM cron.unschedule('cleanup-cron-logs');
  END IF;
END;
$$;

SELECT cron.schedule(
  'cleanup-cron-logs',
  '0 4 * * *',
  $$
  DELETE FROM cron.job_run_details
  WHERE end_time < now() - interval '24 hours';

  DELETE FROM net._http_response
  WHERE created < now() - interval '1 hour';
  $$
);