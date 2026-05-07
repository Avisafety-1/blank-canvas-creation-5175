-- Enable REPLICA IDENTITY FULL for complete row data in real-time updates
ALTER TABLE incident_comments REPLICA IDENTITY FULL;

-- Add table to supabase_realtime publication for real-time subscriptions
ALTER PUBLICATION supabase_realtime ADD TABLE incident_comments;