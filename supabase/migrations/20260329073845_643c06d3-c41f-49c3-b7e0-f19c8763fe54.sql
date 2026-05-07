INSERT INTO eccairs.value_list_items (value_list_key, value_id, value_description) VALUES
('VL1243', '1', 'Open'),
('VL1243', '2', 'Specific'),
('VL1243', '3', 'Certified'),
('VL1243', '4', 'Not applicable'),
('VL1243', '5', 'Unknown'),
('VL1243', '9', 'Authorised Model Aircraft Club / Association'),
('VL1246', '1', 'VLOS'),
('VL1246', '2', 'BVLOS'),
('VL1246', '3', 'FPV'),
('VL1246', '4', 'EVLOS/ UAS operations with observers'),
('VL1246', '5', 'Not applicable'),
('VL1246', '6', 'Unknown')
ON CONFLICT DO NOTHING;