-- Create map_viewer_heartbeats table to track active map viewers
CREATE TABLE public.map_viewer_heartbeats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  session_id text NOT NULL,
  last_seen timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Create index for efficient queries on last_seen
CREATE INDEX idx_map_viewer_heartbeats_last_seen ON public.map_viewer_heartbeats(last_seen);

-- Create unique constraint on session_id to allow upsert
CREATE UNIQUE INDEX idx_map_viewer_heartbeats_session ON public.map_viewer_heartbeats(session_id);

-- Enable RLS
ALTER TABLE public.map_viewer_heartbeats ENABLE ROW LEVEL SECURITY;

-- Policy: Authenticated users can insert/update their own heartbeat
CREATE POLICY "Users can upsert own heartbeat"
ON public.map_viewer_heartbeats
FOR ALL
USING (auth.uid() = user_id OR user_id IS NULL)
WITH CHECK (auth.uid() = user_id OR (auth.uid() IS NOT NULL AND user_id = auth.uid()));

-- Policy: Service role can read all heartbeats (for edge function)
-- Note: Service role bypasses RLS by default

-- Add table to realtime publication for real-time updates
ALTER PUBLICATION supabase_realtime ADD TABLE public.map_viewer_heartbeats;