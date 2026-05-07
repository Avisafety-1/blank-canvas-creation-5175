
drop policy if exists "Authenticated read value_list_items" on eccairs.value_list_items;
create policy "Public read value_list_items"
  on eccairs.value_list_items
  for select
  to anon, authenticated
  using (true);
