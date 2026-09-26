-- Al cargar un Excel de extracto Galicia (CC / CCE), borrar movimientos banco
-- del mismo período que ya no vienen en el archivo (cheque en proceso, PDF
-- duplicado, leyenda vieja). Tesorería no se toca. No aplica a PDF.

CREATE OR REPLACE FUNCTION public.cb_retirar_extracto_banco_ausente(
  p_canal text,
  p_fecha_desde date,
  p_fecha_hasta date,
  p_origen_ids text[]
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  n integer := 0;
  v_ids text[];
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sesión vencida. Recargá la página e iniciá sesión.' USING ERRCODE = '42501';
  END IF;
  IF NOT public.has_permission('cargar_conciliacion_bancaria') THEN
    RAISE EXCEPTION 'Sin permiso para cargar conciliación bancaria.' USING ERRCODE = '42501';
  END IF;
  IF p_canal IS NULL OR p_canal NOT IN ('galicia', 'galicia_usd') THEN
    RAISE EXCEPTION 'Canal inválido.';
  END IF;
  IF p_fecha_desde IS NULL OR p_fecha_hasta IS NULL OR p_fecha_desde > p_fecha_hasta THEN
    RETURN 0;
  END IF;

  v_ids := ARRAY(
    SELECT DISTINCT btrim(x)
    FROM unnest(COALESCE(p_origen_ids, ARRAY[]::text[])) AS x
    WHERE NULLIF(btrim(x), '') IS NOT NULL
  );
  IF COALESCE(cardinality(v_ids), 0) < 5 THEN
    RETURN 0;
  END IF;

  DELETE FROM public.cb_movimiento m
  WHERE m.canal = p_canal
    AND m.origen = 'banco'
    AND m.fecha >= p_fecha_desde
    AND m.fecha <= p_fecha_hasta
    AND NOT (m.origen_id = ANY (v_ids));

  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;

GRANT EXECUTE ON FUNCTION public.cb_retirar_extracto_banco_ausente(text, date, date, text[]) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.cb_retirar_extracto_banco_ausente(text, date, date, text[]) FROM PUBLIC;

COMMENT ON FUNCTION public.cb_retirar_extracto_banco_ausente(text, date, date, text[]) IS
  'Borra movimientos banco Galicia (ARS/USD) del período del Excel que ya no vienen en esa carga. Las conciliaciones caen en cascada. Permiso cargar_conciliacion_bancaria.';
