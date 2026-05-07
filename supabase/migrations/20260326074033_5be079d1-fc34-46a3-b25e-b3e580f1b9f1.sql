-- Clean up duplicate/old tab policy
drop policy if exists "Users can view tabs in visible folders" on public.document_folder_tabs;

-- Create a security definer helper to check folder read access
create or replace function public.can_read_folder(_folder_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.document_folders df
    where df.id = _folder_id
      and (
        df.company_id = any(get_user_visible_company_ids(auth.uid()))
        or (
          df.visible_to_children = true
          and df.company_id = get_parent_company_id(
            (select p.company_id from public.profiles p where p.id = auth.uid())
          )
        )
      )
  )
$$;

-- Rebuild SELECT policies using the shared helper

drop policy if exists "Users can view folders in their company hierarchy" on public.document_folders;
create policy "Users can view folders in their company hierarchy"
  on public.document_folders for select to authenticated
  using (public.can_read_folder(id));

drop policy if exists "Users can view folder items" on public.document_folder_items;
create policy "Users can view folder items"
  on public.document_folder_items for select to authenticated
  using (public.can_read_folder(folder_id));

drop policy if exists "Users can view folder tabs" on public.document_folder_tabs;
create policy "Users can view folder tabs"
  on public.document_folder_tabs for select to authenticated
  using (public.can_read_folder(folder_id));