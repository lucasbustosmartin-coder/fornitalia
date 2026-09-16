-- Evita statement timeout (8s del rol authenticated) al recálcular sugerencias
-- y al cargar tesorería/cierre. Misma lógica de solapamiento y de upsert;
-- el chequeo deja de correr una vez por cada fila insertada.

DROP TRIGGER IF EXISTS trg_cb_match_sin_solapamiento ON public.cb_match;

CREATE OR REPLACE FUNCTION public.cb_match_sin_solapamiento()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Un movimiento no puede estar en dos conciliaciones activas (sugerido/confirmado).
  -- Equivale al chequeo por fila con cb_match_ids_lado, en un solo scan.
  IF EXISTS (
    SELECT 1
    FROM (
      SELECT m.id, x AS mov_id
      FROM public.cb_match m
      CROSS JOIN LATERAL unnest(
        ARRAY[m.banco_id, m.sistema_id]
        || COALESCE(m.banco_ids, ARRAY[]::uuid[])
        || COALESCE(m.sistema_ids, ARRAY[]::uuid[])
      ) AS x
      WHERE m.estado IN ('sugerido', 'confirmado')
        AND x IS NOT NULL
    ) s
    GROUP BY s.mov_id
    HAVING count(DISTINCT s.id) > 1
  ) THEN
    RAISE EXCEPTION 'Uno de los movimientos ya está en otra conciliación activa.';
  END IF;
  RETURN NULL;
END;
$$;

CREATE TRIGGER trg_cb_match_sin_solapamiento
  AFTER INSERT OR UPDATE
  ON public.cb_match
  FOR EACH STATEMENT
  EXECUTE FUNCTION public.cb_match_sin_solapamiento();

CREATE INDEX IF NOT EXISTS idx_cb_match_banco_id_activo
  ON public.cb_match (banco_id)
  WHERE estado IN ('sugerido', 'confirmado');
CREATE INDEX IF NOT EXISTS idx_cb_match_sistema_id_activo
  ON public.cb_match (sistema_id)
  WHERE estado IN ('sugerido', 'confirmado');

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

CREATE OR REPLACE FUNCTION public.cb_reemplazar_sugerencias(p_canal text, p_filas jsonb)
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

CREATE OR REPLACE FUNCTION public.cb_adoptar_id_tesoreria(
  p_canal text,
  p_filas jsonb
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET statement_timeout = '60s'
SET lock_timeout = '30s'
AS $$
DECLARE
  n integer := 0;
  x jsonb;
  v_oid text;
  v_upd integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sesión vencida. Recargá la página e iniciá sesión.' USING ERRCODE = '42501';
  END IF;
  IF NOT public.has_permission('cargar_conciliacion_bancaria') THEN
    RAISE EXCEPTION 'Sin permiso para cargar conciliación bancaria.' USING ERRCODE = '42501';
  END IF;
  IF p_canal IS NULL OR p_canal NOT IN ('mercadopago', 'galicia') THEN
    RAISE EXCEPTION 'Canal inválido.';
  END IF;

  FOR x IN SELECT value FROM jsonb_array_elements(COALESCE(p_filas, '[]'::jsonb))
  LOOP
    v_oid := NULLIF(btrim(x->>'origen_id'), '');
    IF v_oid IS NULL OR (v_oid NOT LIKE 'id|%' AND v_oid NOT LIKE 'cierre|%') THEN
      CONTINUE;
    END IF;
    IF EXISTS (
      SELECT 1 FROM public.cb_movimiento o
      WHERE o.canal = p_canal AND o.origen = 'sistema' AND o.origen_id = v_oid
    ) THEN
      CONTINUE;
    END IF;

    UPDATE public.cb_movimiento s
    SET origen_id = v_oid
    WHERE s.id = (
      SELECT s2.id
      FROM public.cb_movimiento s2
      WHERE s2.canal = p_canal
        AND s2.origen = 'sistema'
        AND s2.origen_id NOT LIKE 'id|%'
        AND s2.origen_id NOT LIKE 'cierre|%'
        AND s2.fecha = COALESCE(NULLIF(btrim(x->>'fecha'), '')::date, s2.fecha)
        AND s2.monto = ROUND(COALESCE((x->>'monto')::numeric, 0), 2)
        AND COALESCE(s2.descripcion, '') = COALESCE(NULLIF(btrim(x->>'descripcion'), ''), '')
        AND COALESCE(s2.contraparte, '') = COALESCE(NULLIF(btrim(x->>'contraparte'), ''), '')
      ORDER BY s2.updated_at DESC
      LIMIT 1
    );
    GET DIAGNOSTICS v_upd = ROW_COUNT;
    n := n + v_upd;
  END LOOP;

  RETURN n;
END;
$$;

CREATE OR REPLACE FUNCTION public.cb_retirar_tesoreria_duplicada_por_cierre(
  p_canal text,
  p_origen_ids text[]
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET statement_timeout = '60s'
SET lock_timeout = '30s'
AS $$
DECLARE
  n integer := 0;
  ids uuid[];
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sesión vencida. Recargá la página e iniciá sesión.' USING ERRCODE = '42501';
  END IF;
  IF NOT public.has_permission('cargar_conciliacion_bancaria') THEN
    RAISE EXCEPTION 'Sin permiso para cargar conciliación bancaria.' USING ERRCODE = '42501';
  END IF;
  IF p_canal IS NULL OR p_canal NOT IN ('mercadopago', 'galicia') THEN
    RAISE EXCEPTION 'Canal inválido.';
  END IF;

  SELECT coalesce(array_agg(DISTINCT s.id), ARRAY[]::uuid[])
  INTO ids
  FROM public.cb_movimiento s
  INNER JOIN public.cb_movimiento c
    ON c.canal = s.canal
   AND c.origen = 'sistema'
   AND c.origen_id = ANY (COALESCE(p_origen_ids, ARRAY[]::text[]))
   AND (c.origen_id LIKE 'id|%' OR c.origen_id LIKE 'cierre|%')
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
