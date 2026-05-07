-- 1) Unsubscribe flag on profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS weekly_report_unsubscribed boolean NOT NULL DEFAULT false;

-- 2) Send log table (idempotency)
CREATE TABLE IF NOT EXISTS public.weekly_report_sends (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  recipient_user_id uuid NOT NULL,
  recipient_email text NOT NULL,
  scope_label text NOT NULL,
  iso_year int NOT NULL,
  iso_week int NOT NULL,
  sent_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'sent',
  error_message text,
  CONSTRAINT weekly_report_sends_unique UNIQUE (company_id, recipient_user_id, iso_year, iso_week)
);

CREATE INDEX IF NOT EXISTS idx_weekly_report_sends_company ON public.weekly_report_sends (company_id, iso_year, iso_week);

ALTER TABLE public.weekly_report_sends ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Superadmins can read weekly sends" ON public.weekly_report_sends;
CREATE POLICY "Superadmins can read weekly sends"
ON public.weekly_report_sends
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'superadmin') OR public.has_role(auth.uid(), 'admin'));

-- 3) Cron extensions
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- 4) Schedule weekly run (Mondays 06:00 UTC ≈ 07:00 Oslo winter / 08:00 summer)
DO $$
DECLARE
  existing_jobid bigint;
BEGIN
  SELECT jobid INTO existing_jobid FROM cron.job WHERE jobname = 'weekly-company-report';
  IF existing_jobid IS NOT NULL THEN
    PERFORM cron.unschedule(existing_jobid);
  END IF;

  PERFORM cron.schedule(
    'weekly-company-report',
    '0 6 * * 1',
    $cron$
    SELECT net.http_post(
      url := 'https://pmucsvrypogtttrajqxq.supabase.co/functions/v1/weekly-company-report',
      headers := jsonb_build_object(
        'Content-Type','application/json',
        'Authorization','Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBtdWNzdnJ5cG9ndHR0cmFqcXhxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQyMjcyMDEsImV4cCI6MjA3OTgwMzIwMX0.DMr5OjalAbZKedx0zqcTBWe5eMTrjlXIw384ycvX8dE'
      ),
      body := '{"trigger":"cron"}'::jsonb
    ) AS request_id;
    $cron$
  );
END $$;