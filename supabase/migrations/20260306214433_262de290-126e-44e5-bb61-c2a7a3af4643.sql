
-- Create DJI credentials table for storing encrypted login data
create table public.dji_credentials (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null unique,
  dji_email text not null,
  dji_password_encrypted text not null,
  dji_account_id text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.dji_credentials enable row level security;

-- Users can read their own credentials (email only visible, password encrypted)
create policy "Users can read own dji_credentials"
  on public.dji_credentials
  for select to authenticated
  using (auth.uid() = user_id);

-- Users can delete their own credentials (logout)
create policy "Users can delete own dji_credentials"
  on public.dji_credentials
  for delete to authenticated
  using (auth.uid() = user_id);
