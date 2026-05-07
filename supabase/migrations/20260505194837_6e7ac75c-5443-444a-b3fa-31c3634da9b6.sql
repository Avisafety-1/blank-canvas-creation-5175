
do $$
begin
  execute 'alter table public.spatial_ref_sys enable row level security';
exception when others then
  raise notice 'spatial_ref_sys RLS enable skipped: %', sqlerrm;
end$$;

do $$
begin
  drop policy if exists "Authenticated read spatial_ref_sys" on public.spatial_ref_sys;
  create policy "Authenticated read spatial_ref_sys"
    on public.spatial_ref_sys for select to authenticated using (true);
exception when others then
  raise notice 'spatial_ref_sys policy skipped: %', sqlerrm;
end$$;

alter table eccairs.value_list_items enable row level security;

drop policy if exists "Authenticated read value_list_items" on eccairs.value_list_items;
create policy "Authenticated read value_list_items"
  on eccairs.value_list_items for select to authenticated using (true);
