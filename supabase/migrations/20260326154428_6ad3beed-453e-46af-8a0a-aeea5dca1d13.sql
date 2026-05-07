
-- Bulk upsert for standard geojson layers (rpas_ctr_tiz, nsm_restriction_zones, rpas_5km_zones)
CREATE OR REPLACE FUNCTION public.bulk_upsert_geojson_features(
  p_table_name text,
  p_features jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_feature jsonb;
  v_success int := 0;
  v_error int := 0;
  v_skipped int := 0;
BEGIN
  FOR v_feature IN SELECT * FROM jsonb_array_elements(p_features)
  LOOP
    BEGIN
      IF v_feature->>'geometry_geojson' IS NULL OR v_feature->>'geometry_geojson' = 'null' THEN
        v_skipped := v_skipped + 1;
        CONTINUE;
      END IF;

      PERFORM public.upsert_geojson_feature(
        p_table_name := p_table_name,
        p_external_id := v_feature->>'external_id',
        p_name := v_feature->>'name',
        p_description := NULL,
        p_geometry_geojson := v_feature->>'geometry_geojson',
        p_properties := (v_feature->'properties')::jsonb
      );
      v_success := v_success + 1;
    EXCEPTION WHEN OTHERS THEN
      v_error := v_error + 1;
    END;
  END LOOP;

  RETURN jsonb_build_object('success', v_success, 'error', v_error, 'skipped', v_skipped);
END;
$$;

-- Bulk upsert for naturvern_zones
CREATE OR REPLACE FUNCTION public.bulk_upsert_naturvern_zones(
  p_features jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_feature jsonb;
  v_success int := 0;
  v_error int := 0;
  v_skipped int := 0;
BEGIN
  FOR v_feature IN SELECT * FROM jsonb_array_elements(p_features)
  LOOP
    BEGIN
      IF v_feature->>'geometry_geojson' IS NULL OR v_feature->>'geometry_geojson' = 'null' THEN
        v_skipped := v_skipped + 1;
        CONTINUE;
      END IF;

      PERFORM public.upsert_naturvern_zone(
        p_external_id := v_feature->>'external_id',
        p_name := v_feature->>'name',
        p_verneform := v_feature->>'verneform',
        p_geometry_geojson := v_feature->>'geometry_geojson',
        p_properties := (v_feature->'properties')::jsonb
      );
      v_success := v_success + 1;
    EXCEPTION WHEN OTHERS THEN
      v_error := v_error + 1;
    END;
  END LOOP;

  RETURN jsonb_build_object('success', v_success, 'error', v_error, 'skipped', v_skipped);
END;
$$;

-- Bulk upsert for vern_restriction_zones
CREATE OR REPLACE FUNCTION public.bulk_upsert_vern_restrictions(
  p_features jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_feature jsonb;
  v_success int := 0;
  v_error int := 0;
  v_skipped int := 0;
BEGIN
  FOR v_feature IN SELECT * FROM jsonb_array_elements(p_features)
  LOOP
    BEGIN
      IF v_feature->>'geometry_geojson' IS NULL OR v_feature->>'geometry_geojson' = 'null' THEN
        v_skipped := v_skipped + 1;
        CONTINUE;
      END IF;

      PERFORM public.upsert_vern_restriction(
        p_external_id := v_feature->>'external_id',
        p_name := v_feature->>'name',
        p_restriction_type := v_feature->>'restriction_type',
        p_geometry_geojson := v_feature->>'geometry_geojson',
        p_properties := (v_feature->'properties')::jsonb
      );
      v_success := v_success + 1;
    EXCEPTION WHEN OTHERS THEN
      v_error := v_error + 1;
    END;
  END LOOP;

  RETURN jsonb_build_object('success', v_success, 'error', v_error, 'skipped', v_skipped);
END;
$$;
