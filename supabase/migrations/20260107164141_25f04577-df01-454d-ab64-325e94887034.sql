-- Add DELETE policy for incident_eccairs_attributes table
CREATE POLICY "delete own incident attributes"
ON incident_eccairs_attributes
FOR DELETE
USING (EXISTS (
  SELECT 1 FROM incidents i WHERE i.id = incident_eccairs_attributes.incident_id
));

-- Refresh PostgREST schema cache
NOTIFY pgrst, 'reload schema';