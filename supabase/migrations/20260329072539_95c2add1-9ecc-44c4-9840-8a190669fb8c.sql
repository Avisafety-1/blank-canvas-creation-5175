INSERT INTO eccairs.value_list_items (value_list_key, value_id, value_description) VALUES
  ('VL800', '1', 'Preliminary'),
  ('VL800', '2', 'Open'),
  ('VL800', '3', 'Closed'),
  ('VL800', '4', 'Data'),
  ('VL800', '5', 'Initial notification'),
  ('VL800', '6', 'Factual'),
  ('VL800', '7', 'Draft'),
  ('VL800', '8', 'Closed on issue')
ON CONFLICT DO NOTHING;