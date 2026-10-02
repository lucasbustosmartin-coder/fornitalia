-- Histórico de movimientos: ID Venta e ID Compra.
-- Columnas en tesorería de banco (cb_movimiento) y cajas físicas (cf_movimiento).
-- Si el Excel trae la columna, el upsert pisa el valor (también vacío).
-- Si el archivo no trae la columna, se conserva lo que ya estaba.

ALTER TABLE public.cb_movimiento
  ADD COLUMN IF NOT EXISTS id_venta text,
  ADD COLUMN IF NOT EXISTS id_compra text;

ALTER TABLE public.cf_movimiento
  ADD COLUMN IF NOT EXISTS id_venta text,
  ADD COLUMN IF NOT EXISTS id_compra text;

ALTER TABLE public.cb_movimiento_eliminado
  ADD COLUMN IF NOT EXISTS id_venta text,
  ADD COLUMN IF NOT EXISTS id_compra text;

COMMENT ON COLUMN public.cb_movimiento.id_venta IS
  'ID Venta del histórico de movimientos (Excel movimientos-historico).';
COMMENT ON COLUMN public.cb_movimiento.id_compra IS
  'ID Compra del histórico de movimientos (Excel movimientos-historico).';
COMMENT ON COLUMN public.cf_movimiento.id_venta IS
  'ID Venta del histórico de movimientos (Excel movimientos-historico).';
COMMENT ON COLUMN public.cf_movimiento.id_compra IS
  'ID Compra del histórico de movimientos (Excel movimientos-historico).';

CREATE INDEX IF NOT EXISTS idx_cb_movimiento_id_venta
  ON public.cb_movimiento (id_venta) WHERE id_venta IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_cb_movimiento_id_compra
  ON public.cb_movimiento (id_compra) WHERE id_compra IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_cf_movimiento_id_venta
  ON public.cf_movimiento (id_venta) WHERE id_venta IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_cf_movimiento_id_compra
  ON public.cf_movimiento (id_compra) WHERE id_compra IS NOT NULL;

CREATE OR REPLACE FUNCTION public.cb_guardar_movimientos(p_canal text, p_origen text, p_filas jsonb)
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
  IF NOT public.has_permission('cargar_conciliacion_bancaria') THEN
    RAISE EXCEPTION 'Sin permiso para cargar conciliación bancaria.' USING ERRCODE = '42501';
  END IF;
  IF p_canal IS NULL OR p_canal NOT IN ('mercadopago', 'galicia', 'galicia_usd', 'credicoop') THEN
    RAISE EXCEPTION 'Canal inválido.';
  END IF;
  IF p_origen IS NULL OR p_origen NOT IN ('banco', 'sistema') THEN
    RAISE EXCEPTION 'Origen inválido.';
  END IF;

  INSERT INTO public.cb_movimiento (
    canal, origen, origen_id, fecha, fecha_hora, tipo, descripcion, contraparte, monto, moneda,
    categoria, cuenta_contable, credito, debito, saldo,
    id_operacion_relacionada, id_movimiento_banco, archivo, fila_excel, raw, estado_banco,
    id_venta, id_compra, created_by
  )
  SELECT p_canal,
         p_origen,
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
         NULLIF(btrim(x->>'id_operacion_relacionada'), ''),
         NULLIF(btrim(x->>'id_movimiento_banco'), ''),
         NULLIF(btrim(x->>'archivo'), ''),
         CASE WHEN x->>'fila_excel' IS NULL OR btrim(x->>'fila_excel') = '' THEN NULL ELSE (x->>'fila_excel')::integer END,
         CASE WHEN x->'raw' IS NULL OR jsonb_typeof(x->'raw') = 'null' THEN NULL ELSE x->'raw' END,
         NULLIF(btrim(COALESCE(x->>'estado_banco', x->'raw'->>'tipo_movimiento')), ''),
         CASE WHEN x->'raw' ? 'id_venta' THEN NULLIF(btrim(x->'raw'->>'id_venta'), '') ELSE NULLIF(btrim(x->>'id_venta'), '') END,
         CASE WHEN x->'raw' ? 'id_compra' THEN NULLIF(btrim(x->'raw'->>'id_compra'), '') ELSE NULLIF(btrim(x->>'id_compra'), '') END,
         auth.uid()
  FROM jsonb_array_elements(COALESCE(p_filas, '[]'::jsonb)) AS x
  WHERE NULLIF(btrim(x->>'origen_id'), '') IS NOT NULL
  ON CONFLICT (canal, origen, origen_id) DO UPDATE SET
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
    id_operacion_relacionada = EXCLUDED.id_operacion_relacionada,
    id_movimiento_banco = EXCLUDED.id_movimiento_banco,
    archivo = EXCLUDED.archivo,
    fila_excel = EXCLUDED.fila_excel,
    raw = EXCLUDED.raw,
    estado_banco = CASE
      WHEN public.cb_estado_banco_es_imputado(cb_movimiento.estado_banco) THEN cb_movimiento.estado_banco
      WHEN public.cb_estado_banco_es_imputado(EXCLUDED.estado_banco) THEN EXCLUDED.estado_banco
      ELSE COALESCE(NULLIF(btrim(EXCLUDED.estado_banco), ''), cb_movimiento.estado_banco)
    END,
    id_venta = CASE
      WHEN EXCLUDED.raw ? 'id_venta' THEN NULLIF(btrim(EXCLUDED.raw->>'id_venta'), '')
      ELSE cb_movimiento.id_venta
    END,
    id_compra = CASE
      WHEN EXCLUDED.raw ? 'id_compra' THEN NULLIF(btrim(EXCLUDED.raw->>'id_compra'), '')
      ELSE cb_movimiento.id_compra
    END;

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
  IF p_canal IS NULL OR p_canal NOT IN ('galicia_facturada', 'morba_sf', 'galicia_dolar', 'efectivo_sf', 'efectivo_sf_usd') THEN
    RAISE EXCEPTION 'Canal de caja inválido.';
  END IF;

  INSERT INTO public.cf_movimiento (
    canal, origen_id, fecha, fecha_hora, tipo, descripcion, contraparte, monto, moneda,
    categoria, cuenta_contable, credito, debito, saldo,
    monto_usd, tipo_cambio_mep, tipo_cambio_fecha,
    archivo, fila_excel, pendiente_baja, raw, id_venta, id_compra, created_by
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
         CASE WHEN x->>'monto_usd' IS NULL OR btrim(x->>'monto_usd') = '' THEN NULL ELSE ROUND((x->>'monto_usd')::numeric, 2) END,
         CASE WHEN x->>'tipo_cambio_mep' IS NULL OR btrim(x->>'tipo_cambio_mep') = '' THEN NULL ELSE (x->>'tipo_cambio_mep')::numeric END,
         NULLIF(btrim(x->>'tipo_cambio_fecha'), '')::date,
         NULLIF(btrim(x->>'archivo'), ''),
         CASE WHEN x->>'fila_excel' IS NULL OR btrim(x->>'fila_excel') = '' THEN NULL ELSE (x->>'fila_excel')::integer END,
         false,
         CASE WHEN x->'raw' IS NULL OR jsonb_typeof(x->'raw') = 'null' THEN NULL ELSE x->'raw' END,
         CASE WHEN x->'raw' ? 'id_venta' THEN NULLIF(btrim(x->'raw'->>'id_venta'), '') ELSE NULLIF(btrim(x->>'id_venta'), '') END,
         CASE WHEN x->'raw' ? 'id_compra' THEN NULLIF(btrim(x->'raw'->>'id_compra'), '') ELSE NULLIF(btrim(x->>'id_compra'), '') END,
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
    monto_usd = EXCLUDED.monto_usd,
    tipo_cambio_mep = EXCLUDED.tipo_cambio_mep,
    tipo_cambio_fecha = EXCLUDED.tipo_cambio_fecha,
    archivo = EXCLUDED.archivo,
    fila_excel = EXCLUDED.fila_excel,
    pendiente_baja = false,
    raw = EXCLUDED.raw,
    id_venta = CASE
      WHEN EXCLUDED.raw ? 'id_venta' THEN NULLIF(btrim(EXCLUDED.raw->>'id_venta'), '')
      ELSE cf_movimiento.id_venta
    END,
    id_compra = CASE
      WHEN EXCLUDED.raw ? 'id_compra' THEN NULLIF(btrim(EXCLUDED.raw->>'id_compra'), '')
      ELSE cf_movimiento.id_compra
    END;

  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;

CREATE OR REPLACE FUNCTION public.cb_archivar_tesoreria(p_mov public.cb_movimiento, p_motivo text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_mov.id IS NULL THEN
    RETURN;
  END IF;
  INSERT INTO public.cb_movimiento_eliminado (
    movimiento_id, canal, origen, origen_id, fecha, fecha_hora, tipo, descripcion,
    contraparte, monto, moneda, categoria, cuenta_contable, credito, debito, saldo,
    id_operacion_relacionada, id_movimiento_banco, archivo, fila_excel, raw,
    created_at, created_by, pendiente_baja, motivo, eliminado_by, id_venta, id_compra
  ) VALUES (
    p_mov.id, p_mov.canal, p_mov.origen, p_mov.origen_id, p_mov.fecha, p_mov.fecha_hora,
    p_mov.tipo, p_mov.descripcion, p_mov.contraparte, p_mov.monto, p_mov.moneda,
    p_mov.categoria, p_mov.cuenta_contable, p_mov.credito, p_mov.debito, p_mov.saldo,
    p_mov.id_operacion_relacionada, p_mov.id_movimiento_banco, p_mov.archivo, p_mov.fila_excel,
    p_mov.raw, p_mov.created_at, p_mov.created_by, p_mov.pendiente_baja, p_motivo, auth.uid(),
    p_mov.id_venta, p_mov.id_compra
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.cb_guardar_movimientos(text, text, jsonb) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.cb_guardar_movimientos(text, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cf_guardar_movimientos(text, jsonb) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.cf_guardar_movimientos(text, jsonb) FROM PUBLIC;
