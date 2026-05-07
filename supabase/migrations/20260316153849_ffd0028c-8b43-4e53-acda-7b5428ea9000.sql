
-- Step 1: Create helper function that returns visible company IDs
-- For admins of a parent company, includes child companies
CREATE OR REPLACE FUNCTION get_user_visible_company_ids(_user_id uuid)
RETURNS uuid[]
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE 
    WHEN EXISTS (
      SELECT 1 FROM user_roles 
      WHERE user_id = _user_id 
      AND role IN ('administrator', 'admin', 'superadmin')
    ) THEN
      ARRAY(
        SELECT id FROM companies 
        WHERE id = (SELECT company_id FROM profiles WHERE id = _user_id)
        OR parent_company_id = (SELECT company_id FROM profiles WHERE id = _user_id)
      )
    ELSE
      ARRAY[(SELECT company_id FROM profiles WHERE id = _user_id)]
  END
$$;

-- =============================================
-- UPDATE SELECT POLICIES: Direct company_id pattern
-- Pattern: company_id = get_user_company_id(auth.uid())
-- Changed to: company_id = ANY(get_user_visible_company_ids(auth.uid()))
-- =============================================

-- calendar_events
DROP POLICY IF EXISTS "Users can view calendar events from own company" ON calendar_events;
CREATE POLICY "Users can view calendar events from own company" ON calendar_events FOR SELECT USING (company_id = ANY(get_user_visible_company_ids(auth.uid())));
DROP POLICY IF EXISTS "Superadmins can view all calendar events" ON calendar_events;

-- company_sora_config
DROP POLICY IF EXISTS "Users can read own company config" ON company_sora_config;
CREATE POLICY "Users can read own company config" ON company_sora_config FOR SELECT USING (company_id = ANY(get_user_visible_company_ids(auth.uid())));

-- company_subscriptions
DROP POLICY IF EXISTS "Company members can read own subscription" ON company_subscriptions;
CREATE POLICY "Company members can read own subscription" ON company_subscriptions FOR SELECT USING (company_id = ANY(get_user_visible_company_ids(auth.uid())));

-- customers
DROP POLICY IF EXISTS "Users can view customers from own company" ON customers;
CREATE POLICY "Users can view customers from own company" ON customers FOR SELECT USING (company_id = ANY(get_user_visible_company_ids(auth.uid())));
DROP POLICY IF EXISTS "Superadmins can view all customers" ON customers;

-- documents
DROP POLICY IF EXISTS "Users can view documents from own company" ON documents;
CREATE POLICY "Users can view documents from own company" ON documents FOR SELECT USING (company_id = ANY(get_user_visible_company_ids(auth.uid())));
DROP POLICY IF EXISTS "Superadmins can view all documents" ON documents;

-- drone_accessories
DROP POLICY IF EXISTS "Users can view accessories for drones in their company" ON drone_accessories;
CREATE POLICY "Users can view accessories for drones in their company" ON drone_accessories FOR SELECT USING (company_id = ANY(get_user_visible_company_ids(auth.uid())));

-- drone_equipment_history
DROP POLICY IF EXISTS "Users can view equipment history from own company" ON drone_equipment_history;
CREATE POLICY "Users can view equipment history from own company" ON drone_equipment_history FOR SELECT USING (company_id = ANY(get_user_visible_company_ids(auth.uid())));

-- drone_inspections
DROP POLICY IF EXISTS "Users can view inspections from own company" ON drone_inspections;
CREATE POLICY "Users can view inspections from own company" ON drone_inspections FOR SELECT USING (company_id = ANY(get_user_visible_company_ids(auth.uid())));

-- drone_log_entries
DROP POLICY IF EXISTS "Users can view log entries from own company" ON drone_log_entries;
CREATE POLICY "Users can view log entries from own company" ON drone_log_entries FOR SELECT USING (company_id = ANY(get_user_visible_company_ids(auth.uid())));

-- drones
DROP POLICY IF EXISTS "Users can view drones from own company" ON drones;
CREATE POLICY "Users can view drones from own company" ON drones FOR SELECT USING (company_id = ANY(get_user_visible_company_ids(auth.uid())));
DROP POLICY IF EXISTS "Superadmins can view all drones" ON drones;

-- dronetag_devices
DROP POLICY IF EXISTS "Users can view dronetag devices from own company" ON dronetag_devices;
CREATE POLICY "Users can view dronetag devices from own company" ON dronetag_devices FOR SELECT USING (company_id = ANY(get_user_visible_company_ids(auth.uid())));

-- dronetag_positions
DROP POLICY IF EXISTS "Users can view dronetag positions from own company" ON dronetag_positions;
CREATE POLICY "Users can view dronetag positions from own company" ON dronetag_positions FOR SELECT USING ((company_id IS NULL) OR company_id = ANY(get_user_visible_company_ids(auth.uid())));

-- eccairs_exports
DROP POLICY IF EXISTS "Users can view exports from own company" ON eccairs_exports;
CREATE POLICY "Users can view exports from own company" ON eccairs_exports FOR SELECT USING (company_id = ANY(get_user_visible_company_ids(auth.uid())));

-- eccairs_integrations
DROP POLICY IF EXISTS "Users can view eccairs integrations from own company" ON eccairs_integrations;
CREATE POLICY "Users can view eccairs integrations from own company" ON eccairs_integrations FOR SELECT USING (company_id = ANY(get_user_visible_company_ids(auth.uid())));

-- equipment
DROP POLICY IF EXISTS "Users can view equipment from own company" ON equipment;
CREATE POLICY "Users can view equipment from own company" ON equipment FOR SELECT USING (company_id = ANY(get_user_visible_company_ids(auth.uid())));
DROP POLICY IF EXISTS "Superadmins can view all equipment" ON equipment;

-- equipment_log_entries
DROP POLICY IF EXISTS "Users can view equipment log entries from own company" ON equipment_log_entries;
CREATE POLICY "Users can view equipment log entries from own company" ON equipment_log_entries FOR SELECT USING (company_id = ANY(get_user_visible_company_ids(auth.uid())));

-- flight_events
DROP POLICY IF EXISTS "Users can view flight events from own company" ON flight_events;
CREATE POLICY "Users can view flight events from own company" ON flight_events FOR SELECT USING (company_id = ANY(get_user_visible_company_ids(auth.uid())));

-- flight_logs
DROP POLICY IF EXISTS "Users can view flight logs from own company" ON flight_logs;
CREATE POLICY "Users can view flight logs from own company" ON flight_logs FOR SELECT USING (company_id = ANY(get_user_visible_company_ids(auth.uid())));

-- incident_eccairs_mappings
DROP POLICY IF EXISTS "Users can view mappings from own company" ON incident_eccairs_mappings;
CREATE POLICY "Users can view mappings from own company" ON incident_eccairs_mappings FOR SELECT USING (company_id = ANY(get_user_visible_company_ids(auth.uid())));

-- incidents
DROP POLICY IF EXISTS "Users can view incidents from own company" ON incidents;
CREATE POLICY "Users can view incidents from own company" ON incidents FOR SELECT USING (company_id = ANY(get_user_visible_company_ids(auth.uid())));
DROP POLICY IF EXISTS "Superadmins can view all incidents" ON incidents;

-- marketing_content_ideas
DROP POLICY IF EXISTS "Users can view own company ideas" ON marketing_content_ideas;
CREATE POLICY "Users can view own company ideas" ON marketing_content_ideas FOR SELECT USING (company_id = ANY(get_user_visible_company_ids(auth.uid())));

-- marketing_drafts
DROP POLICY IF EXISTS "Users can view own company drafts" ON marketing_drafts;
CREATE POLICY "Users can view own company drafts" ON marketing_drafts FOR SELECT USING (company_id = ANY(get_user_visible_company_ids(auth.uid())));

-- marketing_media
DROP POLICY IF EXISTS "marketing_media_select" ON marketing_media;
CREATE POLICY "marketing_media_select" ON marketing_media FOR SELECT USING (company_id = ANY(get_user_visible_company_ids(auth.uid())));

-- mission_risk_assessments
DROP POLICY IF EXISTS "Users can view risk assessments from own company" ON mission_risk_assessments;
CREATE POLICY "Users can view risk assessments from own company" ON mission_risk_assessments FOR SELECT USING (company_id = ANY(get_user_visible_company_ids(auth.uid())));

-- mission_sora
DROP POLICY IF EXISTS "Users can view mission_sora from own company" ON mission_sora;
CREATE POLICY "Users can view mission_sora from own company" ON mission_sora FOR SELECT USING (company_id = ANY(get_user_visible_company_ids(auth.uid())));
DROP POLICY IF EXISTS "Superadmins can view all mission_sora" ON mission_sora;

-- missions
DROP POLICY IF EXISTS "Users can view missions from own company" ON missions;
CREATE POLICY "Users can view missions from own company" ON missions FOR SELECT USING (company_id = ANY(get_user_visible_company_ids(auth.uid())));
DROP POLICY IF EXISTS "Superadmins can view all missions" ON missions;

-- news
DROP POLICY IF EXISTS "Users can view news from own company" ON news;
CREATE POLICY "Users can view news from own company" ON news FOR SELECT USING (company_id = ANY(get_user_visible_company_ids(auth.uid())));
DROP POLICY IF EXISTS "Superadmins can view all news" ON news;

-- pending_dji_logs
DROP POLICY IF EXISTS "Users can view own company pending logs" ON pending_dji_logs;
CREATE POLICY "Users can view own company pending logs" ON pending_dji_logs FOR SELECT USING (company_id = ANY(get_user_visible_company_ids(auth.uid())));

-- personnel_log_entries
DROP POLICY IF EXISTS "Users can view personnel log entries from own company" ON personnel_log_entries;
CREATE POLICY "Users can view personnel log entries from own company" ON personnel_log_entries FOR SELECT USING (company_id = ANY(get_user_visible_company_ids(auth.uid())));

-- profiles
DROP POLICY IF EXISTS "Users can view profiles from own company" ON profiles;
CREATE POLICY "Users can view profiles from own company" ON profiles FOR SELECT USING (company_id = ANY(get_user_visible_company_ids(auth.uid())) OR auth.uid() = id);
DROP POLICY IF EXISTS "Superadmins can view all profiles" ON profiles;

-- =============================================
-- UPDATE SELECT POLICIES: Subquery/JOIN pattern
-- These join through a parent table to check company_id
-- =============================================

-- drone_equipment (joins through drones)
DROP POLICY IF EXISTS "Users can view drone equipment from own company" ON drone_equipment;
CREATE POLICY "Users can view drone equipment from own company" ON drone_equipment FOR SELECT USING (
  EXISTS (SELECT 1 FROM drones WHERE drones.id = drone_equipment.drone_id AND drones.company_id = ANY(get_user_visible_company_ids(auth.uid())))
);

-- drone_personnel (joins through drones)
DROP POLICY IF EXISTS "Users can view drone personnel from own company" ON drone_personnel;
CREATE POLICY "Users can view drone personnel from own company" ON drone_personnel FOR SELECT USING (
  EXISTS (SELECT 1 FROM drones WHERE drones.id = drone_personnel.drone_id AND drones.company_id = ANY(get_user_visible_company_ids(auth.uid())))
);

-- flight_log_equipment (joins through flight_logs)
DROP POLICY IF EXISTS "Users can view flight log equipment from own company" ON flight_log_equipment;
CREATE POLICY "Users can view flight log equipment from own company" ON flight_log_equipment FOR SELECT USING (
  EXISTS (SELECT 1 FROM flight_logs WHERE flight_logs.id = flight_log_equipment.flight_log_id AND flight_logs.company_id = ANY(get_user_visible_company_ids(auth.uid())))
);

-- flight_log_personnel (joins through flight_logs)
DROP POLICY IF EXISTS "Users can view flight log personnel from own company" ON flight_log_personnel;
CREATE POLICY "Users can view flight log personnel from own company" ON flight_log_personnel FOR SELECT USING (
  EXISTS (SELECT 1 FROM flight_logs WHERE flight_logs.id = flight_log_personnel.flight_log_id AND flight_logs.company_id = ANY(get_user_visible_company_ids(auth.uid())))
);

-- incident_comments (joins through incidents)
DROP POLICY IF EXISTS "Users can view comments from own company incidents" ON incident_comments;
CREATE POLICY "Users can view comments from own company incidents" ON incident_comments FOR SELECT USING (
  EXISTS (SELECT 1 FROM incidents WHERE incidents.id = incident_comments.incident_id AND incidents.company_id = ANY(get_user_visible_company_ids(auth.uid())))
);

-- mission_documents (joins through missions)
DROP POLICY IF EXISTS "Users can view mission documents from own company" ON mission_documents;
CREATE POLICY "Users can view mission documents from own company" ON mission_documents FOR SELECT USING (
  EXISTS (SELECT 1 FROM missions WHERE missions.id = mission_documents.mission_id AND missions.company_id = ANY(get_user_visible_company_ids(auth.uid())))
);

-- mission_drones (joins through missions)
DROP POLICY IF EXISTS "Users can view mission_drones in own company" ON mission_drones;
CREATE POLICY "Users can view mission_drones in own company" ON mission_drones FOR SELECT USING (
  EXISTS (SELECT 1 FROM missions WHERE missions.id = mission_drones.mission_id AND missions.company_id = ANY(get_user_visible_company_ids(auth.uid())))
);

-- mission_equipment (joins through missions)
DROP POLICY IF EXISTS "Users can view mission_equipment in own company" ON mission_equipment;
CREATE POLICY "Users can view mission_equipment in own company" ON mission_equipment FOR SELECT USING (
  EXISTS (SELECT 1 FROM missions WHERE missions.id = mission_equipment.mission_id AND missions.company_id = ANY(get_user_visible_company_ids(auth.uid())))
);

-- mission_personnel (joins through missions)
DROP POLICY IF EXISTS "Users can view mission_personnel in own company" ON mission_personnel;
CREATE POLICY "Users can view mission_personnel in own company" ON mission_personnel FOR SELECT USING (
  EXISTS (SELECT 1 FROM missions WHERE missions.id = mission_personnel.mission_id AND missions.company_id = ANY(get_user_visible_company_ids(auth.uid())))
);

-- personnel_competencies (joins through profiles)
DROP POLICY IF EXISTS "Users can view competencies in own company" ON personnel_competencies;
CREATE POLICY "Users can view competencies in own company" ON personnel_competencies FOR SELECT USING (
  EXISTS (SELECT 1 FROM profiles WHERE profiles.id = personnel_competencies.profile_id AND profiles.company_id = ANY(get_user_visible_company_ids(auth.uid())))
);

-- user_roles (joins through profiles) - admin policy
DROP POLICY IF EXISTS "Admins can view roles in own company" ON user_roles;
CREATE POLICY "Admins can view roles in own company" ON user_roles FOR SELECT USING (
  has_role(auth.uid(), 'admin'::app_role) AND EXISTS (
    SELECT 1 FROM profiles WHERE profiles.id = user_roles.user_id AND profiles.company_id = ANY(get_user_visible_company_ids(auth.uid()))
  )
);

-- bulk_email_campaigns
DROP POLICY IF EXISTS "Admins can view own company campaigns" ON bulk_email_campaigns;
CREATE POLICY "Admins can view own company campaigns" ON bulk_email_campaigns FOR SELECT USING (
  (company_id IS NULL AND has_role(auth.uid(), 'superadmin'::app_role))
  OR (company_id IS NOT NULL AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'superadmin'::app_role)) AND company_id = ANY(get_user_visible_company_ids(auth.uid())))
);

-- email_template_attachments (joins through email_templates)
DROP POLICY IF EXISTS "Users can view attachments for their company templates" ON email_template_attachments;
CREATE POLICY "Users can view attachments for their company templates" ON email_template_attachments FOR SELECT USING (
  EXISTS (SELECT 1 FROM email_templates et WHERE et.id = email_template_attachments.template_id AND et.company_id = ANY(get_user_visible_company_ids(auth.uid())))
);
