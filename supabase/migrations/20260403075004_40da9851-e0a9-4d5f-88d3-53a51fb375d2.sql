
SELECT cron.schedule(
  'cleanup-cron-logs',
  '0 4 * * *',
  $$DELETE FROM cron.job_run_details WHERE end_time < now() - interval '7 days'$$
);
