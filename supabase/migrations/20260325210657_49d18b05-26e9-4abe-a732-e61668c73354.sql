create table public.document_folders (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references public.companies(id) on delete cascade not null,
  name text not null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz default now()
);
alter table public.document_folders enable row level security;

create table public.document_folder_items (
  id uuid primary key default gen_random_uuid(),
  folder_id uuid references public.document_folders(id) on delete cascade not null,
  document_id uuid references public.documents(id) on delete cascade not null,
  added_at timestamptz default now(),
  unique(folder_id, document_id)
);
alter table public.document_folder_items enable row level security;

create policy "Users can view folders in their company hierarchy"
  on public.document_folders for select to authenticated
  using (company_id = any(public.get_user_visible_company_ids(auth.uid())));

create policy "Admins can insert folders"
  on public.document_folders for insert to authenticated
  with check (company_id = any(public.get_user_visible_company_ids(auth.uid())));

create policy "Admins can update folders"
  on public.document_folders for update to authenticated
  using (company_id = any(public.get_user_visible_company_ids(auth.uid())));

create policy "Admins can delete folders"
  on public.document_folders for delete to authenticated
  using (company_id = any(public.get_user_visible_company_ids(auth.uid())));

create policy "Users can view folder items"
  on public.document_folder_items for select to authenticated
  using (folder_id in (
    select id from public.document_folders
    where company_id = any(public.get_user_visible_company_ids(auth.uid()))
  ));

create policy "Admins can insert folder items"
  on public.document_folder_items for insert to authenticated
  with check (folder_id in (
    select id from public.document_folders
    where company_id = any(public.get_user_visible_company_ids(auth.uid()))
  ));

create policy "Admins can delete folder items"
  on public.document_folder_items for delete to authenticated
  using (folder_id in (
    select id from public.document_folders
    where company_id = any(public.get_user_visible_company_ids(auth.uid()))
  ));