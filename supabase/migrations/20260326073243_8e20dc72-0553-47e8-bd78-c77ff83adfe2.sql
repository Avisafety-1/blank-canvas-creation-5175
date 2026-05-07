
-- Fix document_folder_items SELECT policy to include visible_to_children folders
drop policy if exists "Users can view folder items" on public.document_folder_items;
create policy "Users can view folder items"
  on public.document_folder_items for select to authenticated
  using (folder_id in (
    select id from public.document_folders
    where company_id = any(get_user_visible_company_ids(auth.uid()))
       or (visible_to_children = true
           and company_id = get_parent_company_id(
             (select company_id from public.profiles where id = auth.uid())
           ))
  ));

-- Fix document_folder_tabs SELECT policy to include visible_to_children folders
drop policy if exists "Users can view folder tabs" on public.document_folder_tabs;
create policy "Users can view folder tabs"
  on public.document_folder_tabs for select to authenticated
  using (exists (
    select 1 from public.document_folders df
    where df.id = document_folder_tabs.folder_id
      and (df.company_id = any(get_user_visible_company_ids(auth.uid()))
           or (df.visible_to_children = true
               and df.company_id = get_parent_company_id(
                 (select company_id from public.profiles where id = auth.uid())
               )))
  ));
