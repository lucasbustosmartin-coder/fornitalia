-- Potenciales duplicados: descartar varios grupos de tesorería de una vez.

CREATE OR REPLACE FUNCTION public.cb_descartar_dup_tesoreria_lote(
  p_canal text,
  p_grupos jsonb
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET statement_timeout = '60s'
SET lock_timeout = '30s'
AS $$
DECLARE
  v_item jsonb;
  v_ids uuid[];
  v_n integer := 0;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sesión vencida. Recargá la página e iniciá sesión.' USING ERRCODE = '42501';
  END IF;
  IF NOT public.has_permission('confirmar_conciliacion_bancaria') THEN
    RAISE EXCEPTION 'Sin permiso para descartar duplicados de tesorería.' USING ERRCODE = '42501';
  END IF;
  IF p_grupos IS NULL OR jsonb_typeof(p_grupos) <> 'array' OR jsonb_array_length(p_grupos) = 0 THEN
    RAISE EXCEPTION 'Falta al menos un grupo.';
  END IF;
  IF jsonb_array_length(p_grupos) > 500 THEN
    RAISE EXCEPTION 'Máximo 500 grupos por vez.';
  END IF;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_grupos)
  LOOP
    IF v_item IS NULL OR jsonb_typeof(v_item) <> 'array' THEN
      CONTINUE;
    END IF;
    SELECT ARRAY(
      SELECT DISTINCT x::uuid
      FROM jsonb_array_elements_text(v_item) AS x
      WHERE NULLIF(btrim(x), '') IS NOT NULL
      ORDER BY 1
    ) INTO v_ids;
    IF COALESCE(cardinality(v_ids), 0) < 2 THEN
      CONTINUE;
    END IF;
    PERFORM public.cb_descartar_dup_tesoreria(p_canal, v_ids);
    v_n := v_n + 1;
  END LOOP;

  IF v_n = 0 THEN
    RAISE EXCEPTION 'Falta al menos un grupo de tesorería (dos movimientos o más).';
  END IF;
  RETURN v_n;
END;
$$;

GRANT EXECUTE ON FUNCTION public.cb_descartar_dup_tesoreria_lote(text, jsonb) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.cb_descartar_dup_tesoreria_lote(text, jsonb) FROM PUBLIC;

COMMENT ON FUNCTION public.cb_descartar_dup_tesoreria_lote(text, jsonb) IS
  'Descarta varios grupos de tesorería como potencial duplicado. p_grupos = [[uuid, uuid], ...]. Permiso confirmar_conciliacion_bancaria.';
