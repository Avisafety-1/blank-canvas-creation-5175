SELECT cron.schedule(
  'sync-openaip-obstacles-daily',
  '10 3 * * *',
  $$
  SELECT net.http_post(
    url:='https://pmucsvrypogtttrajqxq.supabase.co/functions/v1/sync-openaip-obstacles',
    headers:='{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBtdWNzdnJ5cG9ndHR0cmFqcXhxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQyMjcyMDEsImV4cCI6MjA3OTgwMzIwMX0.DMr5OjalAbZKedx0zqcTBWe5eMTrjlXIw384ycvX8dE"}'::jsonb,
    body:='{"time": "now"}'::jsonb
  ) AS request_id;
  $$
);