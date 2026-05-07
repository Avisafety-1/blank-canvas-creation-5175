
-- Fix weights and add new columns for existing models

-- DJI Matrice 4E: 14.1→1.4, payload 0.7→0.2
UPDATE public.drone_models SET weight_kg=1.4, payload_kg=0.2, weight_without_payload_kg=1.2, standard_takeoff_weight_kg=1.4, category='enterprise', endurance_min=49, max_wind_mps=12, sensor_type='mapping' WHERE id='43d37aa2-4e47-4022-95a0-15139edca5ca';

-- DJI Matrice 4T: 14.1→1.4, payload 0.7→0.2
UPDATE public.drone_models SET weight_kg=1.4, payload_kg=0.2, weight_without_payload_kg=1.2, standard_takeoff_weight_kg=1.4, category='enterprise', endurance_min=49, max_wind_mps=12, sensor_type='thermal' WHERE id='685be370-b3b4-4c25-8ea2-273402804117';

-- DJI Matrice 30T: 3.85→3.77
UPDATE public.drone_models SET weight_kg=3.77, weight_without_payload_kg=3.77, standard_takeoff_weight_kg=3.77, category='enterprise', endurance_min=41, max_wind_mps=15, sensor_type='thermal' WHERE id='be03b406-910f-4ba6-a9fd-6c313f9072d1';

-- DJI Matrice 350 RTK: 6.5→6.47
UPDATE public.drone_models SET weight_kg=6.47, weight_without_payload_kg=3.77, standard_takeoff_weight_kg=6.47, category='enterprise', endurance_min=55, max_wind_mps=15, sensor_type='interchangeable' WHERE id='ca29ac27-b0e3-4cb8-be85-d75c93189196';

-- DJI Mini 2 SE: 0.249→0.246
UPDATE public.drone_models SET weight_kg=0.246, weight_without_payload_kg=0.246, standard_takeoff_weight_kg=0.246, category='consumer', endurance_min=31, max_wind_mps=10.5, sensor_type='1/2.3 CMOS' WHERE id='96a55495-2a08-4ec8-baba-537bb6575706';

-- DJI Agras T40: 38→50, C4→C3
UPDATE public.drone_models SET weight_kg=50, eu_class='C3', category='agriculture', endurance_min=20, max_wind_mps=8, sensor_type='spraying' WHERE id='66abaf0e-5751-4b2e-93b3-9e36a57e96bf';

-- DJI Agras T30: C4→C3
UPDATE public.drone_models SET eu_class='C3', category='agriculture', endurance_min=20, max_wind_mps=8, sensor_type='spraying' WHERE id='dc10b1ec-6c2e-4d1b-8142-9fe5cfa42b31';

-- Autel EVO Max 4T: 1.57→1.6
UPDATE public.drone_models SET weight_kg=1.6, weight_without_payload_kg=1.6, standard_takeoff_weight_kg=1.6, category='enterprise', endurance_min=42, max_wind_mps=12, sensor_type='quad sensor' WHERE id='c0570770-2333-4a15-8287-d73b7219c5e0';

-- Fill new columns for remaining existing models
UPDATE public.drone_models SET category='enterprise', endurance_min=120, max_wind_mps=15, sensor_type='ISR' WHERE id='9d6d8d86-199c-4727-9f1b-d91fa8fcf460'; -- Autel Dragonfish Standard
UPDATE public.drone_models SET category='prosumer', endurance_min=38, max_wind_mps=12, sensor_type='1 inch' WHERE id='545b5570-6cde-48e5-a34b-97bae99cd501'; -- Autel EVO II Pro Enterprise
UPDATE public.drone_models SET category='prosumer', endurance_min=40, max_wind_mps=12, sensor_type='8K' WHERE id='3d66b923-260d-4fb9-8629-8625fe385c65'; -- Autel EVO II V3
UPDATE public.drone_models SET category='prosumer', endurance_min=40, max_wind_mps=10, sensor_type='RYYB' WHERE id='ff5c68ef-a1e1-4c53-bea7-71b63f665fad'; -- Autel EVO Lite+
UPDATE public.drone_models SET category='consumer', endurance_min=28, max_wind_mps=10, sensor_type='1/1.28 RYYB' WHERE id='0807822c-6617-437d-b72d-a4cd7ab91c2c'; -- Autel EVO Nano+
UPDATE public.drone_models SET category='prosumer', endurance_min=31, max_wind_mps=10.7, sensor_type='1 inch CMOS' WHERE id='f78089d8-2f65-4376-87ee-585f8b5e4802'; -- DJI Air 2S
UPDATE public.drone_models SET category='prosumer', endurance_min=46, max_wind_mps=12, sensor_type='dual camera' WHERE id='27fd8f17-ff29-4146-8fdb-a0db2bd2c23d'; -- DJI Air 3
UPDATE public.drone_models SET category='prosumer', endurance_min=45, max_wind_mps=12, sensor_type='1 inch CMOS' WHERE id='a916ef49-1873-4cb3-b373-9cb204dd8ac2'; -- DJI Air 3S
UPDATE public.drone_models SET category='fpv', endurance_min=23, max_wind_mps=10, sensor_type='1/1.3 CMOS' WHERE id='4003a69b-1c8e-480b-ad65-f716b176a224'; -- DJI Avata 2
UPDATE public.drone_models SET category='consumer', endurance_min=30, max_wind_mps=10, sensor_type='1/1.3 CMOS' WHERE id='69c97faf-f776-4952-bd5c-dce336c993c7'; -- DJI Flip
UPDATE public.drone_models SET category='fpv', endurance_min=20, max_wind_mps=10, sensor_type='1/2.3 CMOS' WHERE id='3321293c-536f-4a08-8bae-e35e101ec999'; -- DJI FPV
UPDATE public.drone_models SET category='enterprise', endurance_min=28, max_wind_mps=14, sensor_type='interchangeable' WHERE id='e2c4d807-88c8-4fce-9839-827ba45a49c7'; -- DJI Inspire 3
UPDATE public.drone_models SET category='enterprise', endurance_min=41, max_wind_mps=15, sensor_type='zoom' WHERE id='0ceb0ef2-7d57-4030-aad6-7eb65a9f745f'; -- DJI Matrice 30
UPDATE public.drone_models SET category='enterprise', endurance_min=55, max_wind_mps=15, sensor_type='interchangeable' WHERE id='5b23b75f-4c7a-4717-b3e4-53443a0f1e43'; -- DJI Matrice 300 RTK
UPDATE public.drone_models SET category='enterprise', endurance_min=25, max_wind_mps=12, sensor_type='interchangeable' WHERE id='f3426dd6-42c9-41f6-b165-0a4d5a2c1d3c'; -- DJI Matrice 600 Pro
UPDATE public.drone_models SET category='prosumer', endurance_min=46, max_wind_mps=12, sensor_type='4/3 CMOS' WHERE id='57f765dd-7318-4f98-ab4f-0fcc138f8eb8'; -- DJI Mavic 3 Classic
UPDATE public.drone_models SET category='enterprise', endurance_min=45, max_wind_mps=12, sensor_type='mapping', payload_kg=0.2 WHERE id='acc5f006-46bc-45e5-8cf7-ae04d4d550bd'; -- DJI Mavic 3 Enterprise
UPDATE public.drone_models SET category='prosumer', endurance_min=43, max_wind_mps=12, sensor_type='triple camera' WHERE id='39c61150-1011-4cdf-b174-57c64228dc8d'; -- DJI Mavic 3 Pro
UPDATE public.drone_models SET category='enterprise', endurance_min=45, max_wind_mps=12, sensor_type='thermal', payload_kg=0.2 WHERE id='aedc4287-78c8-4a50-8de6-b07dd9c3d329'; -- DJI Mavic 3 Thermal
UPDATE public.drone_models SET category='prosumer', endurance_min=43, max_wind_mps=12, sensor_type='Hasselblad' WHERE id='73704acc-c625-4be0-a741-2d4115656e4a'; -- DJI Mavic 4 Pro
UPDATE public.drone_models SET category='consumer', endurance_min=38, max_wind_mps=10.7, sensor_type='1/1.3 CMOS', name='DJI Mini 3 / Mini 3 Pro' WHERE id='bd1d3dca-68ef-4bd0-b944-af654c366da9'; -- DJI Mini 3
UPDATE public.drone_models SET category='consumer', endurance_min=34, max_wind_mps=10.7, sensor_type='1/1.3 CMOS' WHERE id='e749afa6-986f-45b3-bc15-ebcda35f8d66'; -- DJI Mini 4 Pro
UPDATE public.drone_models SET category='consumer', endurance_min=30, max_wind_mps=10, sensor_type='1/1.3 CMOS' WHERE id='005cc4fc-656d-44b9-a656-2d3626c9a764'; -- DJI Mini 5
UPDATE public.drone_models SET category='consumer', endurance_min=18, max_wind_mps=8, sensor_type='1/2 CMOS' WHERE id='1ce76880-a3b3-45ed-bd59-255e606b7f31'; -- DJI Neo
UPDATE public.drone_models SET category='enterprise', endurance_min=30, max_wind_mps=12, sensor_type='kinematografi' WHERE id='f2ccbe09-73eb-4560-88b1-94d25edf39fc'; -- Freefly Astro
UPDATE public.drone_models SET category='enterprise', endurance_min=32, max_wind_mps=14, sensor_type='48MP' WHERE id='da6635f3-b02a-4d65-a7c1-8b6866ec2330'; -- Parrot Anafi AI
UPDATE public.drone_models SET category='enterprise', endurance_min=32, max_wind_mps=14, sensor_type='RGB + thermal' WHERE id='7dedf465-b3bf-41ad-81cc-5e15bf936ce1'; -- Parrot Anafi USA
UPDATE public.drone_models SET category='survey', endurance_min=90, max_wind_mps=12, sensor_type='mapping' WHERE id='36637cf1-5825-46fd-878b-a08432387e11'; -- senseFly eBee X
UPDATE public.drone_models SET category='enterprise', endurance_min=27, max_wind_mps=10, sensor_type='AI vision' WHERE id='21af447c-c245-494d-9baa-68b6c05a7ea6'; -- Skydio 2+
UPDATE public.drone_models SET category='enterprise', endurance_min=40, max_wind_mps=12, sensor_type='RGB + thermal' WHERE id='c836f91e-154c-4a69-9ef2-30ff4e5474ac'; -- Skydio X10
UPDATE public.drone_models SET eu_class='C3', category='survey', endurance_min=90, max_wind_mps=15, sensor_type='mapping', weight_kg=7.5, payload_kg=0.7 WHERE id='696580fa-4a89-459e-a11b-bd9db92f2c51'; -- Trinity F90+
UPDATE public.drone_models SET category='vtol', endurance_min=120, max_wind_mps=15, sensor_type='cargo' WHERE id='6a0b5833-c230-40e2-9fdd-7aab4d5716d0'; -- Wingcopter 198
UPDATE public.drone_models SET eu_class='C3', category='survey', endurance_min=59, max_wind_mps=12, sensor_type='mapping' WHERE id='45c9a777-c37d-4793-9f17-6f5920b43d7b'; -- WingtraOne Gen II
UPDATE public.drone_models SET category='enterprise', endurance_min=28, max_wind_mps=12, sensor_type='interchangeable' WHERE id='77f8dee0-fc0a-4b68-ad9d-e55b1ac1e143'; -- Yuneec H520E
UPDATE public.drone_models SET category='prosumer', endurance_min=25, max_wind_mps=10, sensor_type='Leica ION' WHERE id='5d19bc5d-f262-45be-a122-9602f753dff8'; -- Yuneec Typhoon H3

-- Insert missing models
INSERT INTO public.drone_models (name, eu_class, weight_kg, payload_kg, weight_without_payload_kg, standard_takeoff_weight_kg, category, endurance_min, max_wind_mps, sensor_type, comment) VALUES
('DJI Mavic 2 Pro', 'C1', 0.907, 0, 0.907, 0.907, 'prosumer', 31, 10.7, '1 inch Hasselblad', NULL),
('DJI Avata', 'C1', 0.410, 0, 0.410, 0.410, 'fpv', 18, 10, '1/1.7 CMOS', 'Første generasjon FPV cinewhoop'),
('Autel Nano', 'C0', 0.249, 0, 0.249, 0.249, 'consumer', 28, 10, '1/2 CMOS', NULL),
('Autel EVO II', 'C2', 1.15, 0, 1.15, 1.15, 'prosumer', 40, 12, '8K', NULL),
('Autel EVO II Dual', 'C2', 1.19, 0, 1.19, 1.19, 'enterprise', 38, 12, 'RGB + thermal', NULL),
('Autel Dragonfish Pro', 'C3', 15, 2, 13, 15, 'vtol', 180, 15, 'ISR', 'Stor VTOL fastving'),
('Parrot Anafi', 'C1', 0.320, 0, 0.320, 0.320, 'prosumer', 25, 10, '1/2.4 CMOS', NULL),
('Parrot Anafi FPV', 'C1', 0.315, 0, 0.315, 0.315, 'fpv', 26, 10, '1/2.4 CMOS', NULL),
('Skydio X2', 'C2', 1.3, 0, 1.3, 1.3, 'enterprise', 35, 12, 'RGB + thermal', NULL),
('DJI Agras T10', 'C3', 24.8, 10, 14.8, 24.8, 'agriculture', 20, 8, 'spraying', NULL),
('DJI Agras T25', 'C3', 32, 20, 12, 32, 'agriculture', 20, 8, 'spraying', NULL),
('DJI FlyCart 30', 'C3', 65, 30, 35, 65, 'cargo', 18, 12, 'cargo', 'Lastdrone');
