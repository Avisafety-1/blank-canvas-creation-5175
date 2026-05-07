-- Aktiver sanntidsoppdateringer for customers tabellen
ALTER TABLE public.customers REPLICA IDENTITY FULL;

-- Legg til tabellen i supabase_realtime publication
ALTER PUBLICATION supabase_realtime ADD TABLE public.customers;