-- ===== Del 1: Rens opp duplikate roller og behold høyeste nivå =====
-- Først, slett alle roller unntatt den med høyeste nivå for hver bruker
WITH role_hierarchy AS (
  SELECT 
    id,
    user_id,
    role,
    CASE role
      WHEN 'superadmin' THEN 5
      WHEN 'admin' THEN 4
      WHEN 'saksbehandler' THEN 3
      WHEN 'operatør' THEN 2
      WHEN 'lesetilgang' THEN 1
      ELSE 0
    END as role_level,
    ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY 
      CASE role
        WHEN 'superadmin' THEN 5
        WHEN 'admin' THEN 4
        WHEN 'saksbehandler' THEN 3
        WHEN 'operatør' THEN 2
        WHEN 'lesetilgang' THEN 1
        ELSE 0
      END DESC
    ) as rn
  FROM user_roles
)
DELETE FROM user_roles
WHERE id IN (
  SELECT id FROM role_hierarchy WHERE rn > 1
);

-- ===== Del 2: Legg til UNIQUE constraint på user_id =====
ALTER TABLE user_roles 
ADD CONSTRAINT user_roles_user_id_unique UNIQUE (user_id);

-- ===== Del 3: Opprett get_user_role() funksjon =====
CREATE OR REPLACE FUNCTION public.get_user_role(_user_id uuid)
RETURNS app_role
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM public.user_roles WHERE user_id = _user_id LIMIT 1
$$;

-- ===== Del 4: Oppdater has_role() med rolle-hierarki =====
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  user_role_level int;
  required_role_level int;
BEGIN
  -- Definér rolle-nivåer
  SELECT CASE get_user_role(_user_id)
    WHEN 'superadmin' THEN 5
    WHEN 'admin' THEN 4
    WHEN 'saksbehandler' THEN 3
    WHEN 'operatør' THEN 2
    WHEN 'lesetilgang' THEN 1
    ELSE 0
  END INTO user_role_level;
  
  SELECT CASE _role
    WHEN 'superadmin' THEN 5
    WHEN 'admin' THEN 4
    WHEN 'saksbehandler' THEN 3
    WHEN 'operatør' THEN 2
    WHEN 'lesetilgang' THEN 1
    ELSE 0
  END INTO required_role_level;
  
  RETURN user_role_level >= required_role_level;
END;
$$;

-- ===== Del 5: Oppdater RLS-policyer - erstatt operativ_leder med saksbehandler =====

-- calendar_events
DROP POLICY IF EXISTS "Admins can update calendar events in own company" ON calendar_events;
CREATE POLICY "Admins can update calendar events in own company"
ON calendar_events
FOR UPDATE
USING ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'saksbehandler'::app_role)) AND (company_id = get_user_company_id(auth.uid())));

-- customers
DROP POLICY IF EXISTS "Admins can update customers in own company" ON customers;
CREATE POLICY "Admins can update customers in own company"
ON customers
FOR UPDATE
USING ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'saksbehandler'::app_role)) AND (company_id = get_user_company_id(auth.uid())));

-- documents
DROP POLICY IF EXISTS "Admins can update documents in own company" ON documents;
CREATE POLICY "Admins can update documents in own company"
ON documents
FOR UPDATE
USING ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'saksbehandler'::app_role)) AND (company_id = get_user_company_id(auth.uid())));

-- drones
DROP POLICY IF EXISTS "Admins can update drones in own company" ON drones;
CREATE POLICY "Admins can update drones in own company"
ON drones
FOR UPDATE
USING ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'saksbehandler'::app_role)) AND (company_id = get_user_company_id(auth.uid())));

-- equipment
DROP POLICY IF EXISTS "Admins can update equipment in own company" ON equipment;
CREATE POLICY "Admins can update equipment in own company"
ON equipment
FOR UPDATE
USING ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'saksbehandler'::app_role)) AND (company_id = get_user_company_id(auth.uid())));

-- incidents
DROP POLICY IF EXISTS "Admins can update incidents in own company" ON incidents;
CREATE POLICY "Admins can update incidents in own company"
ON incidents
FOR UPDATE
USING ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'saksbehandler'::app_role)) AND (company_id = get_user_company_id(auth.uid())));

-- mission_sora
DROP POLICY IF EXISTS "Admins can update mission_sora in own company" ON mission_sora;
CREATE POLICY "Admins can update mission_sora in own company"
ON mission_sora
FOR UPDATE
USING ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'saksbehandler'::app_role)) AND (company_id = get_user_company_id(auth.uid())));

-- missions
DROP POLICY IF EXISTS "Admins can update missions in own company" ON missions;
CREATE POLICY "Admins can update missions in own company"
ON missions
FOR UPDATE
USING ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'saksbehandler'::app_role)) AND (company_id = get_user_company_id(auth.uid())));

-- news (UPDATE)
DROP POLICY IF EXISTS "Admins can update news in own company" ON news;
CREATE POLICY "Admins can update news in own company"
ON news
FOR UPDATE
USING ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'saksbehandler'::app_role)) AND (company_id = get_user_company_id(auth.uid())));

-- news (DELETE)
DROP POLICY IF EXISTS "Admins can delete news in own company" ON news;
CREATE POLICY "Admins can delete news in own company"
ON news
FOR DELETE
USING ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'saksbehandler'::app_role)) AND (company_id = get_user_company_id(auth.uid())));

-- personnel_competencies (UPDATE)
DROP POLICY IF EXISTS "Admins and operativ_leder can update all competencies" ON personnel_competencies;
CREATE POLICY "Admins and saksbehandler can update all competencies"
ON personnel_competencies
FOR UPDATE
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'saksbehandler'::app_role));

-- personnel_competencies (INSERT)
DROP POLICY IF EXISTS "Admins and operativ_leder can create all competencies" ON personnel_competencies;
CREATE POLICY "Admins and saksbehandler can create all competencies"
ON personnel_competencies
FOR INSERT
WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'saksbehandler'::app_role));