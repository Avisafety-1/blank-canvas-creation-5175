-- Enable REPLICA IDENTITY FULL for the news table
ALTER TABLE public.news REPLICA IDENTITY FULL;

-- Add news table to the supabase_realtime publication
ALTER PUBLICATION supabase_realtime ADD TABLE public.news;