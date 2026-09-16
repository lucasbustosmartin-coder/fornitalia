-- Upload masivo de tesorería/cierre con Id (Galicia/MP): evita statement_timeout
-- al adoptar Id y retirar hashes duplicados sobre miles de filas.
-- Ejecutar en Supabase SQL Editor (una vez).

-- Índice para buscar hashes tes| por fecha/monto en adopción y retiro.
CREATE INDEX IF NOT EXISTS idx_cb_movimiento_sistema_hash_fecha_monto
  ON public.cb_movimiento (canal, fecha, monto)
  WHERE origen = 'sistema'
    AND origen_id NOT LIKE 'id|%'
    AND origen_id NOT LIKE 'cierre|%';

-- Adopción set-based (antes: loop fila a fila). Mismo criterio:
-- fecha/monto/descripcion/contraparte; un hash por Id; un Id por hash.
CREATE OR REPLACE FUNCTION public.cb_adoptar_id_tesoreria(
  p_canal text,
  p_filas jsonb
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  n integer := 0;
BEGIN
  -- Lotes del cliente (~100 filas); margen ante tablas grandes.
  SET LOCAL statement_timeout = '90s';

  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sesión vencida. Recargá la página e iniciá sesión.' USING ERRCODE = '42501';
  END IF;
  IF NOT public.has_permission('cargar_conciliacion_bancaria') THEN
    RAISE EXCEPTION 'Sin permiso para cargar conciliación bancaria.' USING ERRCODE = '42501';
  END IF;
  IF p_canal IS NULL OR p_canal NOT IN ('mercadopago', 'galicia') THEN
    RAISE EXCEPTION 'Canal inválido.';
  END IF;

  WITH incoming AS (
    SELECT
      NULLIF(btrim(x->>'origen_id'), '') AS v_oid,
      NULLIF(btrim(x->>'fecha'), '')::date AS v_fecha,
      ROUND(COALESCE((x->>'monto')::numeric, 0), 2) AS v_monto,
      COALESCE(NULLIF(btrim(x->>'descripcion'), ''), '') AS v_desc,
      COALESCE(NULLIF(btrim(x->>'contraparte'), ''), '') AS v_contra,
      ord
    FROM jsonb_array_elements(COALESCE(p_filas, '[]'::jsonb)) WITH ORDINALITY AS t(x, ord)
    WHERE NULLIF(btrim(x->>'origen_id'), '') IS NOT NULL
      AND (
        NULLIF(btrim(x->>'origen_id'), '') LIKE 'id|%'
        OR NULLIF(btrim(x->>'origen_id'), '') LIKE 'cierre|%'
      )
  ),
  need AS (
    SELECT DISTINCT ON (i.v_oid)
      i.v_oid, i.v_fecha, i.v_monto, i.v_desc, i.v_contra, i.ord
    FROM incoming i
    WHERE NOT EXISTS (
      SELECT 1 FROM public.cb_movimiento o
      WHERE o.canal = p_canal AND o.origen = 'sistema' AND o.origen_id = i.v_oid
    )
    ORDER BY i.v_oid, i.ord
  ),
  cand AS (
    SELECT
      n.v_oid,
      n.ord AS in_ord,
      s.id AS sid,
      s.updated_at,
      row_number() OVER (
        PARTITION BY n.v_oid
        ORDER BY s.updated_at DESC NULLS LAST, s.id
      ) AS rn_oid,
      row_number() OVER (
        PARTITION BY s.id
        ORDER BY n.ord, s.updated_at DESC NULLS LAST
      ) AS rn_sid
    FROM need n
    INNER JOIN public.cb_movimiento s
      ON s.canal = p_canal
     AND s.origen = 'sistema'
     AND s.origen_id NOT LIKE 'id|%'
     AND s.origen_id NOT LIKE 'cierre|%'
     AND s.fecha = COALESCE(n.v_fecha, s.fecha)
     AND s.monto = n.v_monto
     AND COALESCE(s.descripcion, '') = n.v_desc
     AND COALESCE(s.contraparte, '') = n.v_contra
  ),
  picked AS (
    SELECT v_oid, sid
    FROM cand
    WHERE rn_oid = 1 AND rn_sid = 1
  )
  UPDATE public.cb_movimiento m
  SET origen_id = p.v_oid
  FROM picked p
  WHERE m.id = p.sid;

  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;

GRANT EXECUTE ON FUNCTION public.cb_adoptar_id_tesoreria(text, jsonb) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.cb_adoptar_id_tesoreria(text, jsonb) FROM PUBLIC;

COMMENT ON FUNCTION public.cb_adoptar_id_tesoreria(text, jsonb) IS
  'Asigna origen_id id|{Id} a tesorería hash del mismo fecha/monto/descripcion/cliente (set-based; lotes).';

-- Retiro de hashes: join por lote de origen_ids (el cliente fragmenta el array).
CREATE OR REPLACE FUNCTION public.cb_retirar_tesoreria_duplicada_por_cierre(
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
  ids uuid[];
  v_ids text[];
BEGIN
  SET LOCAL statement_timeout = '90s';

  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sesión vencida. Recargá la página e iniciá sesión.' USING ERRCODE = '42501';
  END IF;
  IF NOT public.has_permission('cargar_conciliacion_bancaria') THEN
    RAISE EXCEPTION 'Sin permiso para cargar conciliación bancaria.' USING ERRCODE = '42501';
  END IF;
  IF p_canal IS NULL OR p_canal NOT IN ('mercadopago', 'galicia') THEN
    RAISE EXCEPTION 'Canal inválido.';
  END IF;

  v_ids := ARRAY(
    SELECT DISTINCT btrim(x)
    FROM unnest(COALESCE(p_origen_ids, ARRAY[]::text[])) AS x
    WHERE NULLIF(btrim(x), '') IS NOT NULL
      AND (btrim(x) LIKE 'id|%' OR btrim(x) LIKE 'cierre|%')
  );

  IF COALESCE(cardinality(v_ids), 0) = 0 THEN
    RETURN 0;
  END IF;

  SELECT coalesce(array_agg(DISTINCT s.id), ARRAY[]::uuid[])
  INTO ids
  FROM public.cb_movimiento s
  INNER JOIN public.cb_movimiento c
    ON c.canal = p_canal
   AND c.origen = 'sistema'
   AND c.origen_id = ANY (v_ids)
   AND c.fecha = s.fecha
   AND c.monto = s.monto
   AND COALESCE(c.descripcion, '') = COALESCE(s.descripcion, '')
   AND COALESCE(c.contraparte, '') = COALESCE(s.contraparte, '')
  WHERE s.canal = p_canal
    AND s.origen = 'sistema'
    AND s.origen_id NOT LIKE 'id|%'
    AND s.origen_id NOT LIKE 'cierre|%';

  IF ids IS NULL OR coalesce(array_length(ids, 1), 0) = 0 THEN
    RETURN 0;
  END IF;

  DELETE FROM public.cb_match m
  WHERE m.sistema_id = ANY (ids)
     OR m.banco_id = ANY (ids)
     OR COALESCE(m.sistema_ids, ARRAY[]::uuid[]) && ids
     OR COALESCE(m.banco_ids, ARRAY[]::uuid[]) && ids;

  DELETE FROM public.cb_movimiento WHERE id = ANY (ids);
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;

GRANT EXECUTE ON FUNCTION public.cb_retirar_tesoreria_duplicada_por_cierre(text, text[]) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.cb_retirar_tesoreria_duplicada_por_cierre(text, text[]) FROM PUBLIC;

COMMENT ON FUNCTION public.cb_retirar_tesoreria_duplicada_por_cierre(text, text[]) IS
  'Tras cargar tesorería con Id, elimina hash tes| del mismo fecha/monto/descripcion/cliente (lotes).';

-- Upsert: margen de timeout por lote del cliente.
CREATE OR REPLACE FUNCTION public.cb_guardar_movimientos(p_canal text, p_origen text, p_filas jsonb)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  n integer := 0;
BEGIN
  SET LOCAL statement_timeout = '90s';

  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sesión vencida. Recargá la página e iniciá sesión.' USING ERRCODE = '42501';
  END IF;
  IF NOT public.has_permission('cargar_conciliacion_bancaria') THEN
    RAISE EXCEPTION 'Sin permiso para cargar conciliación bancaria.' USING ERRCODE = '42501';
  END IF;
  IF p_canal IS NULL OR p_canal NOT IN ('mercadopago', 'galicia') THEN
    RAISE EXCEPTION 'Canal inválido.';
  END IF;
  IF p_origen IS NULL OR p_origen NOT IN ('banco', 'sistema') THEN
    RAISE EXCEPTION 'Origen inválido.';
  END IF;

  INSERT INTO public.cb_movimiento (
    canal, origen, origen_id, fecha, fecha_hora, tipo, descripcion, contraparte, monto, moneda,
    categoria, cuenta_contable, credito, debito, saldo,
    id_operacion_relacionada, id_movimiento_banco, archivo, fila_excel, raw, created_by
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
    raw = EXCLUDED.raw;

  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;

GRANT EXECUTE ON FUNCTION public.cb_guardar_movimientos(text, text, jsonb) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.cb_guardar_movimientos(text, text, jsonb) FROM PUBLIC;

COMMENT ON FUNCTION public.cb_guardar_movimientos(text, text, jsonb) IS
  'Upsert de movimientos de conciliación (lotes; statement_timeout local 90s).';

-- Regenerar sugerencias: delete + insert puede ser pesado con muchos matches.
CREATE OR REPLACE FUNCTION public.cb_reemplazar_sugerencias(p_canal text, p_filas jsonb)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  n integer := 0;
BEGIN
  SET LOCAL statement_timeout = '90s';

  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sesión vencida. Recargá la página e iniciá sesión.' USING ERRCODE = '42501';
  END IF;
  IF NOT (
    public.has_permission('cargar_conciliacion_bancaria')
    OR public.has_permission('confirmar_conciliacion_bancaria')
  ) THEN
    RAISE EXCEPTION 'Sin permiso para generar sugerencias de conciliación.' USING ERRCODE = '42501';
  END IF;
  IF p_canal IS NULL OR p_canal NOT IN ('mercadopago', 'galicia') THEN
    RAISE EXCEPTION 'Canal inválido.';
  END IF;

  DELETE FROM public.cb_match
  WHERE canal = p_canal AND estado = 'sugerido';

  INSERT INTO public.cb_match (canal, banco_id, sistema_id, score, criterio, estado)
  SELECT p_canal,
         (x->>'banco_id')::uuid,
         (x->>'sistema_id')::uuid,
         ROUND(COALESCE((x->>'score')::numeric, 0), 2),
         NULLIF(btrim(x->>'criterio'), ''),
         'sugerido'
  FROM jsonb_array_elements(COALESCE(p_filas, '[]'::jsonb)) AS x
  WHERE NULLIF(btrim(x->>'banco_id'), '') IS NOT NULL
    AND NULLIF(btrim(x->>'sistema_id'), '') IS NOT NULL;

  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;

GRANT EXECUTE ON FUNCTION public.cb_reemplazar_sugerencias(text, jsonb) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.cb_reemplazar_sugerencias(text, jsonb) FROM PUBLIC;

COMMENT ON FUNCTION public.cb_reemplazar_sugerencias(text, jsonb) IS
  'Reemplaza sugerencias auto del canal (statement_timeout local 90s).';
