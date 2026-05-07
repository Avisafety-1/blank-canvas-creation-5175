
-- changelog_systems
create table public.changelog_systems (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  status text not null default 'green',
  description text,
  sort_order int not null default 0,
  updated_at timestamptz default now()
);

alter table public.changelog_systems enable row level security;

create policy "Anyone authenticated can view systems"
  on public.changelog_systems for select to authenticated using (true);

create policy "Superadmins can insert systems"
  on public.changelog_systems for insert to authenticated
  with check (public.has_role(auth.uid(), 'superadmin'));

create policy "Superadmins can update systems"
  on public.changelog_systems for update to authenticated
  using (public.has_role(auth.uid(), 'superadmin'));

create policy "Superadmins can delete systems"
  on public.changelog_systems for delete to authenticated
  using (public.has_role(auth.uid(), 'superadmin'));

-- changelog_entries
create table public.changelog_entries (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  status text not null default 'ikke_startet',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.changelog_entries enable row level security;

create policy "Anyone authenticated can view entries"
  on public.changelog_entries for select to authenticated using (true);

create policy "Superadmins can insert entries"
  on public.changelog_entries for insert to authenticated
  with check (public.has_role(auth.uid(), 'superadmin'));

create policy "Superadmins can update entries"
  on public.changelog_entries for update to authenticated
  using (public.has_role(auth.uid(), 'superadmin'));

create policy "Superadmins can delete entries"
  on public.changelog_entries for delete to authenticated
  using (public.has_role(auth.uid(), 'superadmin'));

-- changelog_maintenance
create table public.changelog_maintenance (
  id uuid primary key default gen_random_uuid(),
  active boolean not null default false,
  message text not null default 'Drift og vedlikehold pågår',
  updated_at timestamptz default now()
);

alter table public.changelog_maintenance enable row level security;

create policy "Anyone authenticated can view maintenance"
  on public.changelog_maintenance for select to authenticated using (true);

create policy "Superadmins can insert maintenance"
  on public.changelog_maintenance for insert to authenticated
  with check (public.has_role(auth.uid(), 'superadmin'));

create policy "Superadmins can update maintenance"
  on public.changelog_maintenance for update to authenticated
  using (public.has_role(auth.uid(), 'superadmin'));

create policy "Superadmins can delete maintenance"
  on public.changelog_maintenance for delete to authenticated
  using (public.has_role(auth.uid(), 'superadmin'));

-- Seed data
insert into public.changelog_systems (name, status, sort_order) values
  ('SafeSky', 'green', 1),
  ('DJI Cloud', 'green', 2),
  ('Dronetag', 'green', 3),
  ('Kartlag', 'green', 4),
  ('ECCAIRS', 'green', 5),
  ('E-post', 'green', 6);

insert into public.changelog_maintenance (active, message) values
  (false, 'Drift og vedlikehold pågår');
