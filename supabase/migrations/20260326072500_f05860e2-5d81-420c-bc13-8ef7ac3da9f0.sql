alter table public.document_folders
  add column visible_to_children boolean not null default false;

-- Update SELECT policy to also show folders from parent company if visible_to_children is true
drop policy "Users can view folders in their company hierarchy" on public.document_folders;

create policy "Users can view folders in their company hierarchy"
  on public.document_folders for select to authenticated
  using (
    company_id = any(get_user_visible_company_ids(auth.uid()))
    or (
      visible_to_children = true
      and company_id = (select get_parent_company_id(
        (select company_id from public.profiles where id = auth.uid())
      ))
    )
  );