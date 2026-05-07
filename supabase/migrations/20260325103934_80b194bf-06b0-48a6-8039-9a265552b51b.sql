-- Create drone_department_visibility table
CREATE TABLE public.drone_department_visibility (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  drone_id uuid NOT NULL REFERENCES public.drones(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(drone_id, company_id)
);

ALTER TABLE public.drone_department_visibility ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view drone visibility for their companies"
  ON public.drone_department_visibility FOR SELECT
  USING (company_id = ANY(get_user_visible_company_ids(auth.uid())));

CREATE POLICY "Admins can insert drone visibility"
  ON public.drone_department_visibility FOR INSERT
  WITH CHECK (
    has_role(auth.uid(), 'administrator')
    AND company_id = ANY(get_user_visible_company_ids(auth.uid()))
  );

CREATE POLICY "Admins can delete drone visibility"
  ON public.drone_department_visibility FOR DELETE
  USING (
    has_role(auth.uid(), 'administrator')
    AND company_id = ANY(get_user_visible_company_ids(auth.uid()))
  );

-- Create equipment_department_visibility table
CREATE TABLE public.equipment_department_visibility (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  equipment_id uuid NOT NULL REFERENCES public.equipment(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(equipment_id, company_id)
);

ALTER TABLE public.equipment_department_visibility ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view equipment visibility for their companies"
  ON public.equipment_department_visibility FOR SELECT
  USING (company_id = ANY(get_user_visible_company_ids(auth.uid())));

CREATE POLICY "Admins can insert equipment visibility"
  ON public.equipment_department_visibility FOR INSERT
  WITH CHECK (
    has_role(auth.uid(), 'administrator')
    AND company_id = ANY(get_user_visible_company_ids(auth.uid()))
  );

CREATE POLICY "Admins can delete equipment visibility"
  ON public.equipment_department_visibility FOR DELETE
  USING (
    has_role(auth.uid(), 'administrator')
    AND company_id = ANY(get_user_visible_company_ids(auth.uid()))
  );

-- Update drones SELECT policy to include visibility table
DROP POLICY IF EXISTS "Users can view drones from own company" ON drones;
CREATE POLICY "Users can view drones from own company" ON drones
  FOR SELECT USING (
    company_id = ANY(get_user_visible_company_ids(auth.uid()))
    OR EXISTS (
      SELECT 1 FROM public.drone_department_visibility dv
      WHERE dv.drone_id = drones.id
      AND dv.company_id = ANY(get_user_visible_company_ids(auth.uid()))
    )
  );

-- Update equipment SELECT policy to include visibility table
DROP POLICY IF EXISTS "Users can view equipment from own company" ON equipment;
CREATE POLICY "Users can view equipment from own company" ON equipment
  FOR SELECT USING (
    company_id = ANY(get_user_visible_company_ids(auth.uid()))
    OR EXISTS (
      SELECT 1 FROM public.equipment_department_visibility ev
      WHERE ev.equipment_id = equipment.id
      AND ev.company_id = ANY(get_user_visible_company_ids(auth.uid()))
    )
  );