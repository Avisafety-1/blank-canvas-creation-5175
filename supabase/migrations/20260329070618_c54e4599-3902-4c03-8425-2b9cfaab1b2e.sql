INSERT INTO eccairs.value_list_items (value_list_key, value_id, value_synonym, value_description) VALUES
('VL1241', '1', 'Atypical airspace', 'Atypical airspace'),
('VL1241', '2', 'In segregated airspace', 'In segregated airspace'),
('VL1241', '7', 'UAS geographical zone', 'UAS geographical zone'),
('VL1241', '8', 'In heliport/airport environment', 'In heliport/airport environment'),
('VL1241', '9', 'Not applicable', 'Not applicable'),
('VL1241', '10', 'Unknown', 'Unknown'),
('VL1241', '11', 'In controlled airspace', 'In controlled airspace'),
('VL1241', '12', 'In uncontrolled airspace', 'In uncontrolled airspace')
ON CONFLICT DO NOTHING;