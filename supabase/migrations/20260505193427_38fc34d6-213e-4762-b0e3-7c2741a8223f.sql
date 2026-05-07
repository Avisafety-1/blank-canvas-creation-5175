
create table if not exists public.ai_risk_assessment_jobs (
  id uuid primary key default gen_random_uuid(),
  mission_id uuid,
  company_id uuid,
  user_id uuid not null,
  status text not null default 'running',
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  duration_ms integer,
  error_message text,
  created_at timestamptz not null default now()
);

create index if not exists ai_jobs_company_status_idx
  on public.ai_risk_assessment_jobs (company_id, status);
create index if not exists ai_jobs_finished_idx
  on public.ai_risk_assessment_jobs (finished_at desc) where status = 'done';

alter table public.ai_risk_assessment_jobs enable row level security;

create policy "Users can view own ai jobs"
on public.ai_risk_assessment_jobs for select to authenticated
using (user_id = auth.uid() or public.has_role(auth.uid(), 'superadmin'::app_role));

-- p95 estimator (returns ms)
create or replace function public.get_ai_risk_eta_ms()
returns integer
language sql
stable
security definer
set search_path = public
as $$
  with recent as (
    select duration_ms from public.ai_risk_assessment_jobs
    where status = 'done' and duration_ms is not null
    order by finished_at desc nulls last
    limit 100
  )
  select coalesce(
    (select percentile_cont(0.95) within group (order by duration_ms)::int from recent),
    45000
  );
$$;

grant execute on function public.get_ai_risk_eta_ms() to authenticated;
