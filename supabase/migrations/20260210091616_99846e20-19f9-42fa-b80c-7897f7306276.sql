
-- =====================================================
-- Fix AIP ENR 5.1 zone geometries: rectangles → correct shapes
-- =====================================================

-- EN-R102: Oslo sentrum - sirkel, 2 NM (3704m) radius, senter 59°54'33"N 010°43'39"E
UPDATE aip_restriction_zones
SET geometry = ST_Buffer(
  ST_SetSRID(ST_MakePoint(10.7275, 59.9092), 4326)::geography,
  3704
)::geometry
WHERE zone_id = 'EN-R102';

-- EN-R103: Stortinget/Slottet - sirkel, 0.5 NM (926m) radius, senter 59°54'48"N 010°43'34"E
UPDATE aip_restriction_zones
SET geometry = ST_Buffer(
  ST_SetSRID(ST_MakePoint(10.7261, 59.9133), 4326)::geography,
  926
)::geometry
WHERE zone_id = 'EN-R103';

-- EN-P001: Sola - sirkel, 2 NM (3704m) radius, senter 58°53'00"N 005°38'00"E
UPDATE aip_restriction_zones
SET geometry = ST_Buffer(
  ST_SetSRID(ST_MakePoint(5.6333, 58.8833), 4326)::geography,
  3704
)::geometry
WHERE zone_id = 'EN-P001';

-- EN-R301: Haakonsvern - sirkel, 1 NM (1852m) radius, senter 60°22'12"N 005°11'00"E
UPDATE aip_restriction_zones
SET geometry = ST_Buffer(
  ST_SetSRID(ST_MakePoint(5.1833, 60.3700), 4326)::geography,
  1852
)::geometry
WHERE zone_id = 'EN-R301';

-- EN-R104: Fornebu - polygon (irregulær form rundt gamle Fornebu-området)
UPDATE aip_restriction_zones
SET geometry = ST_GeomFromText(
  'POLYGON((10.5850 59.9000, 10.6050 59.9000, 10.6200 59.9050, 10.6300 59.9150, 10.6250 59.9250, 10.6100 59.9300, 10.5900 59.9280, 10.5750 59.9200, 10.5700 59.9100, 10.5850 59.9000))',
  4326
)
WHERE zone_id = 'EN-R104';

-- EN-R201: Rygge - polygon rundt Rygge flystasjon
UPDATE aip_restriction_zones
SET geometry = ST_GeomFromText(
  'POLYGON((10.7500 59.3600, 10.8200 59.3600, 10.8400 59.3700, 10.8400 59.3950, 10.8200 59.4100, 10.7700 59.4100, 10.7400 59.3950, 10.7350 59.3750, 10.7500 59.3600))',
  4326
)
WHERE zone_id = 'EN-R201';

-- EN-R202: Ørland - polygon rundt Ørland hovedflystasjon
UPDATE aip_restriction_zones
SET geometry = ST_GeomFromText(
  'POLYGON((9.5500 63.6700, 9.6200 63.6700, 9.6600 63.6850, 9.6600 63.7100, 9.6300 63.7250, 9.5700 63.7250, 9.5300 63.7100, 9.5300 63.6850, 9.5500 63.6700))',
  4326
)
WHERE zone_id = 'EN-R202';

-- EN-R203: Bodø - polygon rundt Bodø flystasjon
UPDATE aip_restriction_zones
SET geometry = ST_GeomFromText(
  'POLYGON((14.3300 67.2550, 14.4000 67.2550, 14.4400 67.2650, 14.4500 67.2800, 14.4300 67.2950, 14.3800 67.3000, 14.3300 67.2900, 14.3100 67.2750, 14.3300 67.2550))',
  4326
)
WHERE zone_id = 'EN-R203';

-- EN-D301: Hjerkinn skytefelt - polygon
UPDATE aip_restriction_zones
SET geometry = ST_GeomFromText(
  'POLYGON((9.5000 62.1800, 9.7500 62.1800, 9.8500 62.2200, 9.8500 62.3200, 9.7000 62.3600, 9.5000 62.3400, 9.4000 62.2800, 9.4200 62.2000, 9.5000 62.1800))',
  4326
)
WHERE zone_id = 'EN-D301';

-- EN-D302: Regionfelt Østlandet - polygon (stort skytefelt Hedmark)
UPDATE aip_restriction_zones
SET geometry = ST_GeomFromText(
  'POLYGON((11.3000 61.1500, 11.6000 61.1500, 11.7500 61.2000, 11.7500 61.3500, 11.6000 61.4000, 11.3500 61.4000, 11.2000 61.3200, 11.2000 61.2000, 11.3000 61.1500))',
  4326
)
WHERE zone_id = 'EN-D302';

-- EN-D303: Setermoen skytefelt - sirkel, ~5 NM radius, senter ca 68°52'N 018°21'E
UPDATE aip_restriction_zones
SET geometry = ST_Buffer(
  ST_SetSRID(ST_MakePoint(18.3500, 68.8667), 4326)::geography,
  9260
)::geometry
WHERE zone_id = 'EN-D303';

-- EN-D304: Blåtind skytefelt - sirkel, ~4 NM radius, senter ca 68°47'N 018°00'E
UPDATE aip_restriction_zones
SET geometry = ST_Buffer(
  ST_SetSRID(ST_MakePoint(18.0000, 68.7833), 4326)::geography,
  7408
)::geometry
WHERE zone_id = 'EN-D304';

-- EN-D305: Halkavarre skytefelt - polygon (stort felt i Finnmark)
UPDATE aip_restriction_zones
SET geometry = ST_GeomFromText(
  'POLYGON((25.4000 69.8000, 25.8000 69.8000, 26.1000 69.8500, 26.2000 69.9500, 26.0000 70.0500, 25.6000 70.0500, 25.3000 69.9800, 25.2000 69.9000, 25.4000 69.8000))',
  4326
)
WHERE zone_id = 'EN-D305';

-- EN-D310: Troms skytefelt - polygon
UPDATE aip_restriction_zones
SET geometry = ST_GeomFromText(
  'POLYGON((18.4000 68.9500, 18.7000 68.9500, 18.9000 69.0000, 18.9000 69.1000, 18.7000 69.1500, 18.4500 69.1500, 18.3000 69.0800, 18.3000 68.9800, 18.4000 68.9500))',
  4326
)
WHERE zone_id = 'EN-D310';

-- EN-D315: Mauken skytefelt - sirkel, ~3 NM radius, senter ca 68°58'N 018°30'E
UPDATE aip_restriction_zones
SET geometry = ST_Buffer(
  ST_SetSRID(ST_MakePoint(18.5000, 68.9667), 4326)::geography,
  5556
)::geometry
WHERE zone_id = 'EN-D315';

-- EN-D320: Porsangmoen skytefelt - polygon (Finnmark)
UPDATE aip_restriction_zones
SET geometry = ST_GeomFromText(
  'POLYGON((25.0000 69.9500, 25.3000 69.9500, 25.5000 70.0000, 25.5000 70.1000, 25.3000 70.1500, 25.0000 70.1300, 24.8500 70.0500, 24.8500 69.9800, 25.0000 69.9500))',
  4326
)
WHERE zone_id = 'EN-D320';
