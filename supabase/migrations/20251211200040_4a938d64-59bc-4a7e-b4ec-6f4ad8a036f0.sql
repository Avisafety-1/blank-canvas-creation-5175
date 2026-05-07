-- Delete the existing cron job
SELECT cron.unschedule('safesky-advisory-refresh');

-- Create cron job with 5 second interval
SELECT cron.schedule(
  'safesky-cron-refresh',
  '5 seconds',
  $$
  SELECT net.http_post(
    url := 'https://pmucsvrypogtttrajqxq.supabase.co/functions/v1/safesky-cron-refresh',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBtdWNzdnJ5cG9ndHR0cmFqcXhxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQyMjcyMDEsImV4cCI6MjA3OTgwMzIwMX0.DMr5OjalAbZKedx0zqcTBWe5eMTrjlXIw384ycvX8dE'
    ),
    body := '{}'::jsonb
  ) AS request_id;
  $$
);

-- Create safesky_beacons table for caching beacon data
CREATE TABLE IF NOT EXISTS public.safesky_beacons (
  id TEXT PRIMARY KEY,
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  altitude INTEGER,
  course INTEGER,
  ground_speed INTEGER,
  vertical_speed INTEGER,
  beacon_type TEXT,
  callsign TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.safesky_beacons ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to read beacons
CREATE POLICY "Authenticated users can view beacons"
ON public.safesky_beacons
FOR SELECT
USING (auth.role() = 'authenticated');

-- Allow service role to insert/update/delete beacons
CREATE POLICY "Service role can manage beacons"
ON public.safesky_beacons
FOR ALL
USING (true)
WITH CHECK (true);

-- Enable real-time for the table
ALTER TABLE public.safesky_beacons REPLICA IDENTITY FULL;

-- Add to realtime publication
ALTER PUBLICATION supabase_realtime ADD TABLE public.safesky_beacons;