
drop policy if exists "Users can view incidents from own company" on public.incidents;

create policy "Users can view incidents from own company"
  on public.incidents
  for select
  to authenticated
  using (company_id = ANY (get_user_incident_visible_company_ids(auth.uid())));
