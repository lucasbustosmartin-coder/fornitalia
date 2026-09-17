-- Cajas (físicas): canal Morba-s/f (ARS) = Transferencia Morba.
-- tesoreria_transferencia_morba_… / cierre_MOR-… (no conciliable).

ALTER TABLE public.cf_movimiento DROP CONSTRAINT IF EXISTS cf_movimiento_canal_check;
ALTER TABLE public.cf_movimiento
  ADD CONSTRAINT cf_movimiento_canal_check
  CHECK (canal IN ('galicia_facturada', 'morba_sf'));

ALTER TABLE public.eb_saldo_extracto DROP CONSTRAINT IF EXISTS eb_saldo_extracto_canal_check;
ALTER TABLE public.eb_saldo_extracto
  ADD CONSTRAINT eb_saldo_extracto_canal_check
  CHECK (canal IN ('galicia', 'mercadopago', 'galicia_facturada', 'morba_sf'));

COMMENT ON TABLE public.cf_movimiento IS
  'Movimientos de cajas físicas (no conciliables). Galicia-f (ARS) = efectivo pesos; Morba-s/f (ARS) = Transferencia Morba (tesoreria_transferencia_morba / cierre_MOR).';

COMMENT ON TABLE public.eb_saldo_extracto IS
  'Un renglón por corte de saldo. Galicia PDF, Mercado Pago Carta de saldo, Galicia-f (ARS) y Morba-s/f (ARS) (cajas físicas). Upsert por canal+cuenta+fecha_hasta.';

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
  IF NOT public.has_permission('cargar_saldos_extractos') THEN
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
    AND COALESCE(NULLIF(btrim(x->>'canal'), ''), 'galicia') IN ('galicia', 'mercadopago', 'galicia_facturada', 'morba_sf')
  ON CONFLICT (canal, nro_cuenta, fecha_hasta) DO UPDATE SET
    moneda = EXCLUDED.moneda,
    cbu = EXCLUDED.cbu,
    tipo_cuenta = EXCLUDED.tipo_cuenta,
    fecha_desde = EXCLUDED.fecha_desde,
    saldo_inicial = EXCLUDED.saldo_inicial,
    saldo_final = EXCLUDED.saldo_final,
    documento_id = EXCLUDED.documento_id,
    archivo = EXCLUDED.archivo,
    raw = EXCLUDED.raw;

  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;

CREATE OR REPLACE FUNCTION public.cf_guardar_movimientos(p_canal text, p_filas jsonb)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET statement_timeout = '60s'
SET lock_timeout = '30s'
AS $$
DECLARE
  n integer := 0;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sesión vencida. Recargá la página e iniciá sesión.' USING ERRCODE = '42501';
  END IF;
  IF NOT public.has_permission('cargar_cajas_fisicas') THEN
    RAISE EXCEPTION 'Sin permiso para cargar cajas físicas.' USING ERRCODE = '42501';
  END IF;
  IF p_canal IS NULL OR p_canal NOT IN ('galicia_facturada', 'morba_sf') THEN
    RAISE EXCEPTION 'Canal de caja inválido.';
  END IF;

  INSERT INTO public.cf_movimiento (
    canal, origen_id, fecha, fecha_hora, tipo, descripcion, contraparte, monto, moneda,
    categoria, cuenta_contable, credito, debito, saldo,
    archivo, fila_excel, pendiente_baja, raw, created_by
  )
  SELECT p_canal,
         NULLIF(btrim(x->>'origen_id'), ''),
         COALESCE(NULLIF(btrim(x->>'fecha'), '')::date, public.fecha_hoy_argentina()),
         NULLIF(btrim(x->>'fecha_hora'), '')::timestamptz,
         NULLIF(btrim(x->>'tipo'), ''),
         NULLIF(btrim(x->>'descripcion'), ''),
         NULLIF(btrim(x->>'contraparte'), ''),
         ROUND(COALESCE((x->>'monto')::numeric, 0), 2),
         COALESCE(NULLIF(btrim(x->>'moneda'), ''), 'ARS'),
         NULLIF(btrim(x->>'categoria'), ''),
         NULLIF(btrim(x->>'cuenta_contable'), ''),
         CASE WHEN x->>'credito' IS NULL OR btrim(x->>'credito') = '' THEN NULL ELSE ROUND((x->>'credito')::numeric, 2) END,
         CASE WHEN x->>'debito' IS NULL OR btrim(x->>'debito') = '' THEN NULL ELSE ROUND((x->>'debito')::numeric, 2) END,
         CASE WHEN x->>'saldo' IS NULL OR btrim(x->>'saldo') = '' THEN NULL ELSE ROUND((x->>'saldo')::numeric, 2) END,
         NULLIF(btrim(x->>'archivo'), ''),
         CASE WHEN x->>'fila_excel' IS NULL OR btrim(x->>'fila_excel') = '' THEN NULL ELSE (x->>'fila_excel')::integer END,
         false,
         CASE WHEN x->'raw' IS NULL OR jsonb_typeof(x->'raw') = 'null' THEN NULL ELSE x->'raw' END,
         auth.uid()
  FROM jsonb_array_elements(COALESCE(p_filas, '[]'::jsonb)) AS x
  WHERE NULLIF(btrim(x->>'origen_id'), '') IS NOT NULL
  ON CONFLICT (canal, origen_id) DO UPDATE SET
    fecha = EXCLUDED.fecha,
    fecha_hora = EXCLUDED.fecha_hora,
    tipo = EXCLUDED.tipo,
    descripcion = EXCLUDED.descripcion,
    contraparte = EXCLUDED.contraparte,
    monto = EXCLUDED.monto,
    moneda = EXCLUDED.moneda,
    categoria = EXCLUDED.categoria,
    cuenta_contable = EXCLUDED.cuenta_contable,
    credito = EXCLUDED.credito,
    debito = EXCLUDED.debito,
    saldo = EXCLUDED.saldo,
    archivo = EXCLUDED.archivo,
    fila_excel = EXCLUDED.fila_excel,
    pendiente_baja = false,
    raw = EXCLUDED.raw;

  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;

CREATE OR REPLACE FUNCTION public.cf_marcar_tesoreria_abierta_ausente(
  p_canal text,
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
  IF NOT public.has_permission('cargar_cajas_fisicas') THEN
    RAISE EXCEPTION 'Sin permiso para cargar cajas físicas.' USING ERRCODE = '42501';
  END IF;
  IF p_canal IS NULL OR p_canal NOT IN ('galicia_facturada', 'morba_sf') THEN
    RAISE EXCEPTION 'Canal de caja inválido.';
  END IF;

  v_ids := ARRAY(
    SELECT DISTINCT btrim(x)
    FROM unnest(COALESCE(p_origen_ids, ARRAY[]::text[])) AS x
    WHERE NULLIF(btrim(x), '') IS NOT NULL
  );

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
    AND NOT (m.origen_id = ANY (v_ids));

  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;

CREATE OR REPLACE FUNCTION public.cf_guardar_saldo_caja(p_filas jsonb)
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
  IF NOT public.has_permission('cargar_cajas_fisicas') THEN
    RAISE EXCEPTION 'Sin permiso para cargar cajas físicas.' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.eb_saldo_extracto (
    canal, moneda, nro_cuenta, cbu, tipo_cuenta,
    fecha_desde, fecha_hasta, saldo_inicial, saldo_final,
    documento_id, archivo, raw, created_by
  )
  SELECT COALESCE(NULLIF(btrim(x->>'canal'), ''), 'galicia_facturada'),
         COALESCE(NULLIF(btrim(x->>'moneda'), ''), 'ARS'),
         COALESCE(NULLIF(btrim(x->>'nro_cuenta'), ''), COALESCE(NULLIF(btrim(x->>'canal'), ''), 'galicia_facturada')),
         NULL,
         COALESCE(NULLIF(btrim(x->>'tipo_cuenta'), ''), 'Caja física'),
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
    AND COALESCE(NULLIF(btrim(x->>'canal'), ''), 'galicia_facturada') IN ('galicia_facturada', 'morba_sf')
  ON CONFLICT (canal, nro_cuenta, fecha_hasta) DO UPDATE SET
    moneda = EXCLUDED.moneda,
    tipo_cuenta = EXCLUDED.tipo_cuenta,
    fecha_desde = EXCLUDED.fecha_desde,
    saldo_inicial = EXCLUDED.saldo_inicial,
    saldo_final = EXCLUDED.saldo_final,
    documento_id = EXCLUDED.documento_id,
    archivo = EXCLUDED.archivo,
    raw = EXCLUDED.raw;

  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;
