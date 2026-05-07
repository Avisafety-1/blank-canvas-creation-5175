
-- Extensions
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Config table (single row)
create table if not exists public.monitoring_config (
  id int primary key default 1,
  recipient_emails text[] not null default array['hauggard@gmail.com','rikardvb@gmail.com']::text[],
  db_errors_per_10m int not null default 10,
  edge_5xx_per_10m int not null default 5,
  edge_p95_ms int not null default 10000,
  auth_failures_per_10m int not null default 20,
  enabled boolean not null default true,
  updated_at timestamptz not null default now(),
  constraint single_row check (id = 1)
);

insert into public.monitoring_config (id) values (1) on conflict (id) do nothing;

alter table public.monitoring_config enable row level security;

create policy "Superadmins can view monitoring config"
on public.monitoring_config for select to authenticated
using (public.has_role(auth.uid(), 'superadmin'::app_role));

create policy "Superadmins can update monitoring config"
on public.monitoring_config for update to authenticated
using (public.has_role(auth.uid(), 'superadmin'::app_role));

-- Alerts log
create table if not exists public.monitoring_alerts (
  id uuid primary key default gen_random_uuid(),
  alert_type text not null,
  severity text not null default 'warning',
  subject text not null,
  details jsonb,
  sent_at timestamptz not null default now()
);

create index if not exists monitoring_alerts_type_time_idx
  on public.monitoring_alerts (alert_type, sent_at desc);

alter table public.monitoring_alerts enable row level security;

create policy "Superadmins can view monitoring alerts"
on public.monitoring_alerts for select to authenticated
using (public.has_role(auth.uid(), 'superadmin'::app_role));

-- Cron jobs
do $$
declare
  v_url_health text := 'https://pmucsvrypogtttrajqxq.supabase.co/functions/v1/system-health-monitor';
  v_url_digest text := 'https://pmucsvrypogtttrajqxq.supabase.co/functions/v1/operations-digest';
  v_anon text := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBtdWNzdnJ5cG9ndHR0cmFqcXhxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQyMjcyMDEsImV4cCI6MjA3OTgwMzIwMX0.DMr5OjalAbZKedx0zqcTBWe5eMTrjlXIw384ycvX8dE';
begin
  -- Remove existing jobs with same name (idempotent)
  perform cron.unschedule(jobid) from cron.job where jobname in ('system-health-monitor','operations-digest');

  perform cron.schedule(
    'system-health-monitor',
    '*/10 * * * *',
    format($f$select net.http_post(url:=%L, headers:=%L::jsonb, body:='{}'::jsonb) as request_id;$f$,
      v_url_health,
      json_build_object('Content-Type','application/json','apikey',v_anon,'Authorization','Bearer '||v_anon)::text)
  );

  perform cron.schedule(
    'operations-digest',
    '0 7 * * *',
    format($f$select net.http_post(url:=%L, headers:=%L::jsonb, body:='{}'::jsonb) as request_id;$f$,
      v_url_digest,
      json_build_object('Content-Type','application/json','apikey',v_anon,'Authorization','Bearer '||v_anon)::text)
  );
end$$;
