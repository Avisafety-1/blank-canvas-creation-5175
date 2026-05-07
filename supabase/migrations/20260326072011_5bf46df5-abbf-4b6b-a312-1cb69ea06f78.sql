create table public.document_folder_tabs (
  id uuid primary key default gen_random_uuid(),
  folder_id uuid not null references public.document_folders(id) on delete cascade,
  name text not null,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

alter table public.document_folder_tabs enable row level security;

create policy "Users can view tabs in visible folders"
  on public.document_folder_tabs for select to authenticated
  using (
    exists (
      select 1 from public.document_folders df
      where df.id = document_folder_tabs.folder_id
        and df.company_id = any(get_user_visible_company_ids(auth.uid()))
    )
  );

create policy "Admins can insert tabs"
  on public.document_folder_tabs for insert to authenticated
  with check (
    exists (
      select 1 from public.document_folders df
      where df.id = document_folder_tabs.folder_id
        and df.company_id = any(get_user_visible_company_ids(auth.uid()))
    )
    and public.has_role(auth.uid(), 'admin')
  );

create policy "Admins can update tabs"
  on public.document_folder_tabs for update to authenticated
  using (
    exists (
      select 1 from public.document_folders df
      where df.id = document_folder_tabs.folder_id
        and df.company_id = any(get_user_visible_company_ids(auth.uid()))
    )
    and public.has_role(auth.uid(), 'admin')
  );

create policy "Admins can delete tabs"
  on public.document_folder_tabs for delete to authenticated
  using (
    exists (
      select 1 from public.document_folders df
      where df.id = document_folder_tabs.folder_id
        and df.company_id = any(get_user_visible_company_ids(auth.uid()))
    )
    and public.has_role(auth.uid(), 'admin')
  );

alter table public.document_folder_items
  add column tab_id uuid references public.document_folder_tabs(id) on delete set null;