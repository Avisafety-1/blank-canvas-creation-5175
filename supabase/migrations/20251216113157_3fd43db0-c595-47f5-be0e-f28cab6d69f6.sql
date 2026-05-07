-- Make Preflight drone and Before takeoff checklists globally visible
UPDATE public.documents 
SET global_visibility = true 
WHERE id IN (
  '199874c6-d6d3-4104-903c-51dfff394ede',
  '8cb19ac3-2304-4884-a418-fc7e9f0bf86f'
);