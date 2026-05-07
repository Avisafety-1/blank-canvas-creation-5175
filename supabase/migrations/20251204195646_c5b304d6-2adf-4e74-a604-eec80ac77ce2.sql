-- Delete duplicate calendar events that were created for drone inspections
-- These are now handled directly from the drones table's neste_inspeksjon field
DELETE FROM public.calendar_events 
WHERE description LIKE 'drone_inspection:%';