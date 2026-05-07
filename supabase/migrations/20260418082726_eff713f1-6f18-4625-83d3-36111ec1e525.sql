
-- flight_logs: replace admin policy with hierarchy-aware version
DROP POLICY IF EXISTS "Admins can manage all flight logs in own company" ON public.flight_logs;
CREATE POLICY "Admins can manage flight logs in visible companies"
  ON public.flight_logs FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin'::app_role) AND company_id = ANY(get_user_visible_company_ids(auth.uid())))
  WITH CHECK (has_role(auth.uid(),'admin'::app_role) AND company_id = ANY(get_user_visible_company_ids(auth.uid())));

-- flight_log_personnel: admin can fully manage in visible companies
CREATE POLICY "Admins can manage flight log personnel in visible companies"
  ON public.flight_log_personnel FOR ALL TO authenticated
  USING (
    has_role(auth.uid(),'admin'::app_role)
    AND EXISTS (
      SELECT 1 FROM public.flight_logs fl
      WHERE fl.id = flight_log_personnel.flight_log_id
        AND fl.company_id = ANY(get_user_visible_company_ids(auth.uid()))
    )
  )
  WITH CHECK (
    has_role(auth.uid(),'admin'::app_role)
    AND EXISTS (
      SELECT 1 FROM public.flight_logs fl
      WHERE fl.id = flight_log_personnel.flight_log_id
        AND fl.company_id = ANY(get_user_visible_company_ids(auth.uid()))
    )
  );

-- flight_log_equipment: admin can fully manage in visible companies
CREATE POLICY "Admins can manage flight log equipment in visible companies"
  ON public.flight_log_equipment FOR ALL TO authenticated
  USING (
    has_role(auth.uid(),'admin'::app_role)
    AND EXISTS (
      SELECT 1 FROM public.flight_logs fl
      WHERE fl.id = flight_log_equipment.flight_log_id
        AND fl.company_id = ANY(get_user_visible_company_ids(auth.uid()))
    )
  )
  WITH CHECK (
    has_role(auth.uid(),'admin'::app_role)
    AND EXISTS (
      SELECT 1 FROM public.flight_logs fl
      WHERE fl.id = flight_log_equipment.flight_log_id
        AND fl.company_id = ANY(get_user_visible_company_ids(auth.uid()))
    )
  );

-- drone_log_entries: admin UPDATE in visible companies, replace DELETE policy
DROP POLICY IF EXISTS "Admins can delete log entries in own company" ON public.drone_log_entries;
CREATE POLICY "Admins can delete log entries in visible companies"
  ON public.drone_log_entries FOR DELETE TO authenticated
  USING (has_role(auth.uid(),'admin'::app_role) AND company_id = ANY(get_user_visible_company_ids(auth.uid())));

CREATE POLICY "Admins can update log entries in visible companies"
  ON public.drone_log_entries FOR UPDATE TO authenticated
  USING (has_role(auth.uid(),'admin'::app_role) AND company_id = ANY(get_user_visible_company_ids(auth.uid())))
  WITH CHECK (has_role(auth.uid(),'admin'::app_role) AND company_id = ANY(get_user_visible_company_ids(auth.uid())));

-- equipment_log_entries: same pattern
DROP POLICY IF EXISTS "Admins can delete equipment log entries in own company" ON public.equipment_log_entries;
CREATE POLICY "Admins can delete equipment log entries in visible companies"
  ON public.equipment_log_entries FOR DELETE TO authenticated
  USING (has_role(auth.uid(),'admin'::app_role) AND company_id = ANY(get_user_visible_company_ids(auth.uid())));

CREATE POLICY "Admins can update equipment log entries in visible companies"
  ON public.equipment_log_entries FOR UPDATE TO authenticated
  USING (has_role(auth.uid(),'admin'::app_role) AND company_id = ANY(get_user_visible_company_ids(auth.uid())))
  WITH CHECK (has_role(auth.uid(),'admin'::app_role) AND company_id = ANY(get_user_visible_company_ids(auth.uid())));

-- personnel_log_entries: same pattern (drop existing admin delete if it exists)
DROP POLICY IF EXISTS "Admins can delete personnel log entries in own company" ON public.personnel_log_entries;
CREATE POLICY "Admins can delete personnel log entries in visible companies"
  ON public.personnel_log_entries FOR DELETE TO authenticated
  USING (has_role(auth.uid(),'admin'::app_role) AND company_id = ANY(get_user_visible_company_ids(auth.uid())));

CREATE POLICY "Admins can update personnel log entries in visible companies"
  ON public.personnel_log_entries FOR UPDATE TO authenticated
  USING (has_role(auth.uid(),'admin'::app_role) AND company_id = ANY(get_user_visible_company_ids(auth.uid())))
  WITH CHECK (has_role(auth.uid(),'admin'::app_role) AND company_id = ANY(get_user_visible_company_ids(auth.uid())));
