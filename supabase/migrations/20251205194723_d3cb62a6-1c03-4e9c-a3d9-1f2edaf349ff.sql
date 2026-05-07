-- Enable RLS on drone_telemetry table
ALTER TABLE drone_telemetry ENABLE ROW LEVEL SECURITY;

-- All authenticated users can view telemetry (telemetry should be visible across the organization)
CREATE POLICY "Authenticated users can view telemetry"
ON drone_telemetry FOR SELECT
TO authenticated
USING (true);

-- Service role can insert telemetry (for external telemetry sources)
CREATE POLICY "Service role can insert telemetry"
ON drone_telemetry FOR INSERT
TO service_role
WITH CHECK (true);

-- Enable realtime for drone_telemetry
ALTER TABLE drone_telemetry REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE drone_telemetry;