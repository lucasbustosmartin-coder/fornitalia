-- Cortes Galicia ya cargados (sin raw.regla_movimientos) no se recalculan.
-- Los cortes nuevos: saldo = último corte + movimientos Excel (CC/CCE/MP).
-- El PDF solo verifica; no pisa históricos. No es tesorería sistema.
-- Mercado Pago cartas, cajas físicas y Credicoop siguen con UPSERT completo.

CREATE OR REPLACE FUNCTION public.eb_guardar_saldos(p_filas jsonb)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  n integer := 0;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sesión vencida. Recargá la página e iniciá sesión.' USING ERRCODE = '42501';
  END IF;
  IF NOT public.has_permission('cargar_saldos_extractos')
     AND NOT public.has_permission('cargar_cajas_fisicas')
     AND NOT public.has_permission('cargar_conciliacion_bancaria') THEN
    RAISE EXCEPTION 'Sin permiso para cargar saldos de extractos.' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.eb_saldo_extracto (
    canal, moneda, nro_cuenta, cbu, tipo_cuenta,
    fecha_desde, fecha_hasta, saldo_inicial, saldo_final,
    documento_id, archivo, raw, created_by
  )
  SELECT COALESCE(NULLIF(btrim(x->>'canal'), ''), 'galicia'),
         COALESCE(NULLIF(btrim(x->>'moneda'), ''), 'ARS'),
         COALESCE(NULLIF(btrim(x->>'nro_cuenta'), ''), ''),
         NULLIF(btrim(x->>'cbu'), ''),
         NULLIF(btrim(x->>'tipo_cuenta'), ''),
         COALESCE(NULLIF(btrim(x->>'fecha_desde'), '')::date, public.fecha_hoy_argentina()),
         COALESCE(NULLIF(btrim(x->>'fecha_hasta'), '')::date, public.fecha_hoy_argentina()),
         CASE WHEN x->>'saldo_inicial' IS NULL OR btrim(x->>'saldo_inicial') = '' THEN NULL
              ELSE ROUND((x->>'saldo_inicial')::numeric, 2) END,
         ROUND(COALESCE((x->>'saldo_final')::numeric, 0), 2),
         NULLIF(btrim(x->>'documento_id'), ''),
         NULLIF(btrim(x->>'archivo'), ''),
         CASE WHEN x->'raw' IS NULL OR jsonb_typeof(x->'raw') = 'null' THEN NULL ELSE x->'raw' END,
         auth.uid()
  FROM jsonb_array_elements(COALESCE(p_filas, '[]'::jsonb)) AS x
  WHERE NULLIF(btrim(x->>'fecha_hasta'), '') IS NOT NULL
    AND COALESCE(NULLIF(btrim(x->>'canal'), ''), 'galicia') IN (
      'galicia', 'mercadopago', 'galicia_facturada', 'morba_sf', 'galicia_dolar', 'galicia_usd',
      'credicoop', 'efectivo_sf', 'efectivo_sf_usd'
    )
  ON CONFLICT (canal, nro_cuenta, fecha_hasta) DO UPDATE SET
    moneda = CASE
      WHEN public.eb_saldo_extracto.canal IN ('galicia', 'galicia_usd')
       AND COALESCE(public.eb_saldo_extracto.raw->>'regla_movimientos', '') NOT IN ('1', 'true')
      THEN public.eb_saldo_extracto.moneda
      ELSE EXCLUDED.moneda END,
    cbu = CASE
      WHEN public.eb_saldo_extracto.canal IN ('galicia', 'galicia_usd')
       AND COALESCE(public.eb_saldo_extracto.raw->>'regla_movimientos', '') NOT IN ('1', 'true')
      THEN public.eb_saldo_extracto.cbu
      ELSE EXCLUDED.cbu END,
    tipo_cuenta = CASE
      WHEN public.eb_saldo_extracto.canal IN ('galicia', 'galicia_usd')
       AND COALESCE(public.eb_saldo_extracto.raw->>'regla_movimientos', '') NOT IN ('1', 'true')
      THEN public.eb_saldo_extracto.tipo_cuenta
      ELSE EXCLUDED.tipo_cuenta END,
    fecha_desde = CASE
      WHEN public.eb_saldo_extracto.canal IN ('galicia', 'galicia_usd')
       AND COALESCE(public.eb_saldo_extracto.raw->>'regla_movimientos', '') NOT IN ('1', 'true')
      THEN public.eb_saldo_extracto.fecha_desde
      ELSE EXCLUDED.fecha_desde END,
    saldo_inicial = CASE
      WHEN public.eb_saldo_extracto.canal IN ('galicia', 'galicia_usd')
       AND COALESCE(public.eb_saldo_extracto.raw->>'regla_movimientos', '') NOT IN ('1', 'true')
      THEN public.eb_saldo_extracto.saldo_inicial
      ELSE EXCLUDED.saldo_inicial END,
    saldo_final = CASE
      WHEN public.eb_saldo_extracto.canal IN ('galicia', 'galicia_usd')
       AND COALESCE(public.eb_saldo_extracto.raw->>'regla_movimientos', '') NOT IN ('1', 'true')
      THEN public.eb_saldo_extracto.saldo_final
      ELSE EXCLUDED.saldo_final END,
    documento_id = CASE
      WHEN public.eb_saldo_extracto.canal IN ('galicia', 'galicia_usd')
       AND COALESCE(public.eb_saldo_extracto.raw->>'regla_movimientos', '') NOT IN ('1', 'true')
      THEN public.eb_saldo_extracto.documento_id
      ELSE EXCLUDED.documento_id END,
    archivo = CASE
      WHEN public.eb_saldo_extracto.canal IN ('galicia', 'galicia_usd')
       AND COALESCE(public.eb_saldo_extracto.raw->>'regla_movimientos', '') NOT IN ('1', 'true')
      THEN public.eb_saldo_extracto.archivo
      ELSE EXCLUDED.archivo END,
    raw = CASE
      WHEN public.eb_saldo_extracto.canal IN ('galicia', 'galicia_usd')
       AND COALESCE(public.eb_saldo_extracto.raw->>'regla_movimientos', '') NOT IN ('1', 'true')
      THEN public.eb_saldo_extracto.raw
      ELSE EXCLUDED.raw END;

  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;

GRANT EXECUTE ON FUNCTION public.eb_guardar_saldos(jsonb) TO authenticated;

COMMENT ON FUNCTION public.eb_guardar_saldos(jsonb) IS
  'UPSERT de cortes. Galicia ARS/USD ya cargados sin regla_movimientos no se pisan (extractos históricos). Cortes nuevos y el resto de canales sí.';
