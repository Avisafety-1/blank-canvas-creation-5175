-- Fix descriptions for 99200xxx RPAS items to match official ECCAIRS short labels
UPDATE eccairs.value_list_items SET value_description = 'Battery failure' WHERE value_list_key = 'VL390' AND value_id = '99200013';
UPDATE eccairs.value_list_items SET value_description = 'RPAS/UAS flight control system failure' WHERE value_list_key = 'VL390' AND value_id = '99200014';
UPDATE eccairs.value_list_items SET value_description = 'Ground control station failure' WHERE value_list_key = 'VL390' AND value_id = '99200015';
UPDATE eccairs.value_list_items SET value_description = 'RPAS/UAS collision avoidance system failure' WHERE value_list_key = 'VL390' AND value_id = '99200016';
UPDATE eccairs.value_list_items SET value_description = 'RPAS/UAS Loss of Visual Contact' WHERE value_list_key = 'VL390' AND value_id = '99200017';
UPDATE eccairs.value_list_items SET value_description = 'Control and Monitoring Unit (CMU)' WHERE value_list_key = 'VL390' AND value_id = '99200018';
UPDATE eccairs.value_list_items SET value_description = 'Control and Monitoring Unit (CMU) erroneous operation' WHERE value_list_key = 'VL390' AND value_id = '99200019';
UPDATE eccairs.value_list_items SET value_description = 'Control and Monitoring Unit (CMU) loss or unavailable' WHERE value_list_key = 'VL390' AND value_id = '99200020';
UPDATE eccairs.value_list_items SET value_description = 'Flight termination system - Loss or Unavailable' WHERE value_list_key = 'VL390' AND value_id = '99200021';
UPDATE eccairs.value_list_items SET value_description = 'Parachute rescue system - Loss or Unavailable' WHERE value_list_key = 'VL390' AND value_id = '99200022';
UPDATE eccairs.value_list_items SET value_description = 'RPAS/UAS Electro magnetic interference' WHERE value_list_key = 'VL390' AND value_id = '99200023';
UPDATE eccairs.value_list_items SET value_description = 'Airspace infringement by RPAS/UAS' WHERE value_list_key = 'VL390' AND value_id = '99200025';
UPDATE eccairs.value_list_items SET value_description = 'Geographical zone Infringement' WHERE value_list_key = 'VL390' AND value_id = '99200026';
UPDATE eccairs.value_list_items SET value_description = 'Flight termination system - erroneous operation' WHERE value_list_key = 'VL390' AND value_id = '99200004';
UPDATE eccairs.value_list_items SET value_description = 'Parachute rescue system - erroneous operation' WHERE value_list_key = 'VL390' AND value_id = '99200005';