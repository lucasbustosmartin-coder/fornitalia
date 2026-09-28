-- Galicia CC/CCE: un movimiento Imputado no se borra en cargas posteriores.
-- Solo se puede retirar si, al registrarse, el Tipo de Movimiento NO era Imputado
-- (p. ej. En proceso / cheque en proceso). Si no hay estado, no se toca.

ALTER TABLE public.cb_movimiento
  ADD COLUMN IF NOT EXISTS estado_banco text;

COMMENT ON COLUMN public.cb_movimiento.estado_banco IS
  'Tipo de Movimiento del extracto Galicia (Imputado, En proceso, …). Vacío = desconocido (p. ej. PDF). Un Imputado no se retira.';

CREATE OR REPLACE FUNCTION public.cb_norm_estado_banco(p text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT lower(translate(btrim(COALESCE(p, '')),
    'ÁÉÍÓÚÜÑáéíóúüñ',
    'AEIOUUnaeiouun'));
$$;

CREATE OR REPLACE FUNCTION public.cb_estado_banco_es_imputado(p text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT public.cb_norm_estado_banco(p) = 'imputado'
      OR public.cb_norm_estado_banco(p) LIKE 'imputado %'
      OR public.cb_norm_estado_banco(p) LIKE 'imputado-%';
$$;

-- Solo si el banco lo anotó con un estado distinto de Imputado.
CREATE OR REPLACE FUNCTION public.cb_estado_banco_puede_retirarse(p text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN public.cb_norm_estado_banco(p) = '' THEN false
    WHEN public.cb_estado_banco_es_imputado(p) THEN false
    ELSE true
  END;
$$;

CREATE OR REPLACE FUNCTION public.cb_movimiento_estado_banco_efectivo(m public.cb_movimiento)
RETURNS text
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(
    NULLIF(btrim(m.estado_banco), ''),
    NULLIF(btrim(m.raw->>'tipo_movimiento'), '')
  );
$$;

UPDATE public.cb_movimiento m
SET estado_banco = COALESCE(
  NULLIF(btrim(m.estado_banco), ''),
  NULLIF(btrim(m.raw->>'tipo_movimiento'), ''),
  CASE
    WHEN public.cb_estado_banco_es_imputado(m.categoria)
      OR public.cb_estado_banco_puede_retirarse(m.categoria)
    THEN NULLIF(btrim(m.categoria), '')
    ELSE NULL
  END
)
WHERE m.origen = 'banco'
  AND m.canal IN ('galicia', 'galicia_usd')
  AND NULLIF(btrim(COALESCE(m.estado_banco, '')), '') IS NULL
  AND (
    NULLIF(btrim(m.raw->>'tipo_movimiento'), '') IS NOT NULL
    OR public.cb_estado_banco_es_imputado(m.categoria)
    OR public.cb_estado_banco_puede_retirarse(m.categoria)
  );

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
    AND NOT (m.origen_id = ANY (v_ids))
    AND public.cb_estado_banco_puede_retirarse(public.cb_movimiento_estado_banco_efectivo(m));

  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;

GRANT EXECUTE ON FUNCTION public.cb_retirar_extracto_banco_ausente(text, date, date, text[]) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.cb_retirar_extracto_banco_ausente(text, date, date, text[]) FROM PUBLIC;

COMMENT ON FUNCTION public.cb_retirar_extracto_banco_ausente(text, date, date, text[]) IS
  'Retira del extracto Galicia (ARS/USD) solo movimientos banco que no estaban Imputados (p. ej. En proceso) y que este Excel ya no trae. Un Imputado o sin estado no se borra. Tesorería no se toca.';

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
    id_operacion_relacionada, id_movimiento_banco, archivo, fila_excel, raw, estado_banco, created_by
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
    END;

  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;

GRANT EXECUTE ON FUNCTION public.cb_guardar_movimientos(text, text, jsonb) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.cb_guardar_movimientos(text, text, jsonb) FROM PUBLIC;
