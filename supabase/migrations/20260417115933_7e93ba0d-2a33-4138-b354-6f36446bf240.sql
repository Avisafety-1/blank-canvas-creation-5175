-- Allow technical responsible to update assigned drone (inspection fields)
CREATE POLICY "Tech responsible can update assigned drone"
ON public.drones FOR UPDATE
TO authenticated
USING (technical_responsible_id = auth.uid())
WITH CHECK (technical_responsible_id = auth.uid());

-- Allow technical responsible to log inspections for assigned drone
CREATE POLICY "Tech responsible can create inspections for assigned drone"
ON public.drone_inspections FOR INSERT
TO authenticated
WITH CHECK (
  user_id = auth.uid()
  AND drone_id IN (
    SELECT id FROM public.drones WHERE technical_responsible_id = auth.uid()
  )
);