-- Update superadmin RLS policies to respect company selection

-- 1. calendar_events
DROP POLICY IF EXISTS "Superadmins can view all calendar events" ON calendar_events;
CREATE POLICY "Superadmins can view all calendar events" ON calendar_events
  FOR SELECT USING (is_superadmin(auth.uid()) AND company_id = get_user_company_id(auth.uid()));

-- 2. customers
DROP POLICY IF EXISTS "Superadmins can view all customers" ON customers;
CREATE POLICY "Superadmins can view all customers" ON customers
  FOR SELECT USING (is_superadmin(auth.uid()) AND company_id = get_user_company_id(auth.uid()));

-- 3. documents
DROP POLICY IF EXISTS "Superadmins can view all documents" ON documents;
CREATE POLICY "Superadmins can view all documents" ON documents
  FOR SELECT USING (is_superadmin(auth.uid()) AND company_id = get_user_company_id(auth.uid()));

DROP POLICY IF EXISTS "Superadmins can update all documents" ON documents;
CREATE POLICY "Superadmins can update all documents" ON documents
  FOR UPDATE USING (is_superadmin(auth.uid()) AND company_id = get_user_company_id(auth.uid()));

DROP POLICY IF EXISTS "Superadmins can delete all documents" ON documents;
CREATE POLICY "Superadmins can delete all documents" ON documents
  FOR DELETE USING (is_superadmin(auth.uid()) AND company_id = get_user_company_id(auth.uid()));

-- 4. drones
DROP POLICY IF EXISTS "Superadmins can view all drones" ON drones;
CREATE POLICY "Superadmins can view all drones" ON drones
  FOR SELECT USING (is_superadmin(auth.uid()) AND company_id = get_user_company_id(auth.uid()));

-- 5. equipment
DROP POLICY IF EXISTS "Superadmins can view all equipment" ON equipment;
CREATE POLICY "Superadmins can view all equipment" ON equipment
  FOR SELECT USING (is_superadmin(auth.uid()) AND company_id = get_user_company_id(auth.uid()));

-- 6. incidents
DROP POLICY IF EXISTS "Superadmins can view all incidents" ON incidents;
CREATE POLICY "Superadmins can view all incidents" ON incidents
  FOR SELECT USING (is_superadmin(auth.uid()) AND company_id = get_user_company_id(auth.uid()));

DROP POLICY IF EXISTS "Superadmins can update all incidents" ON incidents;
CREATE POLICY "Superadmins can update all incidents" ON incidents
  FOR UPDATE USING (is_superadmin(auth.uid()) AND company_id = get_user_company_id(auth.uid()));

DROP POLICY IF EXISTS "Superadmins can delete all incidents" ON incidents;
CREATE POLICY "Superadmins can delete all incidents" ON incidents
  FOR DELETE USING (is_superadmin(auth.uid()) AND company_id = get_user_company_id(auth.uid()));

-- 7. mission_sora
DROP POLICY IF EXISTS "Superadmins can view all mission_sora" ON mission_sora;
CREATE POLICY "Superadmins can view all mission_sora" ON mission_sora
  FOR SELECT USING (is_superadmin(auth.uid()) AND company_id = get_user_company_id(auth.uid()));

-- 8. missions
DROP POLICY IF EXISTS "Superadmins can view all missions" ON missions;
CREATE POLICY "Superadmins can view all missions" ON missions
  FOR SELECT USING (is_superadmin(auth.uid()) AND company_id = get_user_company_id(auth.uid()));

DROP POLICY IF EXISTS "Superadmins can update all missions" ON missions;
CREATE POLICY "Superadmins can update all missions" ON missions
  FOR UPDATE USING (is_superadmin(auth.uid()) AND company_id = get_user_company_id(auth.uid()));

DROP POLICY IF EXISTS "Superadmins can delete all missions" ON missions;
CREATE POLICY "Superadmins can delete all missions" ON missions
  FOR DELETE USING (is_superadmin(auth.uid()) AND company_id = get_user_company_id(auth.uid()));

-- 9. news
DROP POLICY IF EXISTS "Superadmins can view all news" ON news;
CREATE POLICY "Superadmins can view all news" ON news
  FOR SELECT USING (is_superadmin(auth.uid()) AND company_id = get_user_company_id(auth.uid()));

-- 10. profiles
DROP POLICY IF EXISTS "Superadmins can view all profiles" ON profiles;
CREATE POLICY "Superadmins can view all profiles" ON profiles
  FOR SELECT USING (is_superadmin(auth.uid()) AND company_id = get_user_company_id(auth.uid()));

DROP POLICY IF EXISTS "Superadmins can approve all users" ON profiles;
CREATE POLICY "Superadmins can approve all users" ON profiles
  FOR UPDATE USING (is_superadmin(auth.uid()) AND company_id = get_user_company_id(auth.uid()));

DROP POLICY IF EXISTS "Superadmins can delete all users" ON profiles;
CREATE POLICY "Superadmins can delete all users" ON profiles
  FOR DELETE USING (is_superadmin(auth.uid()) AND company_id = get_user_company_id(auth.uid()));