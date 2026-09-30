-- A eliminar: solo Status Pendiente cuya fecha cae dentro del rango del archivo
-- cargado (histórico o tesorería) y cuyo Id no viene en ese archivo.
-- Si el Excel no cubre la fecha, no se marca: un filtro del usuario no implica baja.
-- Confirmado nunca. El cierre no entra en esta lógica.

DROP FUNCTION IF EXISTS public.cb_marcar_tesoreria_abierta_ausente(text, text[]);

CREATE OR REPLACE FUNCTION public.cb_marcar_tesoreria_abierta_ausente(
  p_canal text,
  p_origen_ids text[],
  p_fecha_desde date DEFAULT NULL,
  p_fecha_hasta date DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  n integer := 0;
  v_ids text[];
  v_desde date;
  v_hasta date;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sesión vencida. Recargá la página e iniciá sesión.' USING ERRCODE = '42501';
  END IF;
  IF NOT public.has_permission('cargar_conciliacion_bancaria') THEN
    RAISE EXCEPTION 'Sin permiso para cargar conciliación bancaria.' USING ERRCODE = '42501';
  END IF;
  IF p_canal IS NULL OR p_canal NOT IN ('mercadopago', 'galicia', 'galicia_usd', 'credicoop') THEN
    RAISE EXCEPTION 'Canal inválido.';
  END IF;

  v_ids := ARRAY(
    SELECT DISTINCT btrim(x)
    FROM unnest(COALESCE(p_origen_ids, ARRAY[]::text[])) AS x
    WHERE NULLIF(btrim(x), '') IS NOT NULL
  );

  v_desde := LEAST(p_fecha_desde, p_fecha_hasta);
  v_hasta := GREATEST(p_fecha_desde, p_fecha_hasta);

  UPDATE public.cb_movimiento m
  SET pendiente_baja = false
  WHERE m.canal = p_canal
    AND COALESCE(m.pendiente_baja, false)
    AND lower(btrim(COALESCE(m.raw->>'status', m.raw->>'Status', ''))) IS DISTINCT FROM 'pendiente';

  UPDATE public.cb_movimiento m
  SET pendiente_baja = false
  WHERE m.canal = p_canal
    AND public.cb_es_tesoreria_abierta(m)
    AND m.origen_id = ANY (v_ids);

  UPDATE public.cb_movimiento m
  SET pendiente_baja = true
  WHERE m.canal = p_canal
    AND public.cb_es_tesoreria_abierta(m)
    AND COALESCE(cardinality(v_ids), 0) > 0
    AND v_desde IS NOT NULL
    AND v_hasta IS NOT NULL
    AND m.fecha BETWEEN v_desde AND v_hasta
    AND NOT (m.origen_id = ANY (v_ids));

  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;

DROP FUNCTION IF EXISTS public.cf_marcar_tesoreria_abierta_ausente(text, text[]);

CREATE OR REPLACE FUNCTION public.cf_marcar_tesoreria_abierta_ausente(
  p_canal text,
  p_origen_ids text[],
  p_fecha_desde date DEFAULT NULL,
  p_fecha_hasta date DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  n integer := 0;
  v_ids text[];
  v_desde date;
  v_hasta date;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sesión vencida. Recargá la página e iniciá sesión.' USING ERRCODE = '42501';
  END IF;
  IF NOT public.has_permission('cargar_cajas_fisicas') THEN
    RAISE EXCEPTION 'Sin permiso para cargar cajas físicas.' USING ERRCODE = '42501';
  END IF;
  IF p_canal IS NULL OR p_canal NOT IN (
    'galicia_facturada', 'morba_sf', 'galicia_dolar', 'efectivo_sf', 'efectivo_sf_usd'
  ) THEN
    RAISE EXCEPTION 'Canal de caja inválido.';
  END IF;

  v_ids := ARRAY(
    SELECT DISTINCT btrim(x)
    FROM unnest(COALESCE(p_origen_ids, ARRAY[]::text[])) AS x
    WHERE NULLIF(btrim(x), '') IS NOT NULL
  );

  v_desde := LEAST(p_fecha_desde, p_fecha_hasta);
  v_hasta := GREATEST(p_fecha_desde, p_fecha_hasta);

  UPDATE public.cf_movimiento m
  SET pendiente_baja = false
  WHERE m.canal = p_canal
    AND COALESCE(m.pendiente_baja, false)
    AND lower(btrim(COALESCE(m.raw->>'status', m.raw->>'Status', ''))) IS DISTINCT FROM 'pendiente';

  UPDATE public.cf_movimiento m
  SET pendiente_baja = false
  WHERE m.canal = p_canal
    AND public.cf_es_tesoreria_abierta(m)
    AND m.origen_id = ANY (v_ids);

  UPDATE public.cf_movimiento m
  SET pendiente_baja = true
  WHERE m.canal = p_canal
    AND public.cf_es_tesoreria_abierta(m)
    AND COALESCE(cardinality(v_ids), 0) > 0
    AND v_desde IS NOT NULL
    AND v_hasta IS NOT NULL
    AND m.fecha BETWEEN v_desde AND v_hasta
    AND NOT (m.origen_id = ANY (v_ids));

  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;

GRANT EXECUTE ON FUNCTION public.cb_marcar_tesoreria_abierta_ausente(text, text[], date, date) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.cb_marcar_tesoreria_abierta_ausente(text, text[], date, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cf_marcar_tesoreria_abierta_ausente(text, text[], date, date) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.cf_marcar_tesoreria_abierta_ausente(text, text[], date, date) FROM PUBLIC;

COMMENT ON FUNCTION public.cb_marcar_tesoreria_abierta_ausente(text, text[], date, date) IS
  'Marca Pendiente ausente solo si su fecha cae en el rango del archivo. Confirmado no se marca.';
COMMENT ON FUNCTION public.cf_marcar_tesoreria_abierta_ausente(text, text[], date, date) IS
  'Marca Pendiente de caja ausente solo si su fecha cae en el rango del archivo. Confirmado no se marca.';
