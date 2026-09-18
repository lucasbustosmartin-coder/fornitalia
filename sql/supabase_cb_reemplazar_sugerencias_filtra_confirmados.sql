-- Recálculo de sugerencias: no insertar pares que pisen un confirmado
-- (o se dupliquen en el lote). Tampoco pares con más de 4 días de diferencia.
-- El trigger de solapamiento ahora nombra el movimiento si igual falla.

CREATE OR REPLACE FUNCTION public.cb_match_sin_solapamiento()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_detalle text;
BEGIN
  SELECT string_agg(d.linea, ' | ')
  INTO v_detalle
  FROM (
    SELECT format(
      '%s %s %s %s',
      COALESCE(mv.origen, 'mov'),
      COALESCE(to_char(mv.fecha, 'DD/MM/YYYY'), '?'),
      COALESCE(mv.monto::text, '?'),
      left(COALESCE(NULLIF(btrim(mv.descripcion), ''), NULLIF(btrim(mv.tipo), ''), mv.id::text), 70)
    ) AS linea
    FROM (
      SELECT s.mov_id
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
      LIMIT 3
    ) dup
    LEFT JOIN public.cb_movimiento mv ON mv.id = dup.mov_id
  ) d;

  IF v_detalle IS NOT NULL THEN
    RAISE EXCEPTION 'Uno de los movimientos ya está en otra conciliación activa: %', v_detalle;
  END IF;
  RETURN NULL;
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
  WITH locked AS (
    SELECT DISTINCT mov AS mov_id
    FROM public.cb_match m
    CROSS JOIN LATERAL unnest(
      ARRAY[m.banco_id, m.sistema_id]
      || COALESCE(m.banco_ids, ARRAY[]::uuid[])
      || COALESCE(m.sistema_ids, ARRAY[]::uuid[])
    ) AS mov
    WHERE m.estado IN ('sugerido', 'confirmado')
      AND mov IS NOT NULL
  ),
  raw AS (
    SELECT (elem.x->>'banco_id')::uuid AS banco_id,
           (elem.x->>'sistema_id')::uuid AS sistema_id,
           ROUND(COALESCE((elem.x->>'score')::numeric, 0), 2) AS score,
           NULLIF(btrim(elem.x->>'criterio'), '') AS criterio,
           elem.ord
    FROM jsonb_array_elements(COALESCE(p_filas, '[]'::jsonb))
         WITH ORDINALITY AS elem(x, ord)
    WHERE NULLIF(btrim(elem.x->>'banco_id'), '') IS NOT NULL
      AND NULLIF(btrim(elem.x->>'sistema_id'), '') IS NOT NULL
  ),
  filtrado AS (
    SELECT r.banco_id, r.sistema_id, r.score, r.criterio, r.ord
    FROM raw r
    INNER JOIN public.cb_movimiento b ON b.id = r.banco_id
    INNER JOIN public.cb_movimiento s ON s.id = r.sistema_id
    WHERE abs(b.fecha - s.fecha) <= 4
      AND COALESCE(r.criterio, '') NOT ILIKE '%lejana%'
      AND NOT EXISTS (SELECT 1 FROM locked l WHERE l.mov_id = r.banco_id)
      AND NOT EXISTS (SELECT 1 FROM locked l WHERE l.mov_id = r.sistema_id)
  )
  SELECT p_canal, x.banco_id, x.sistema_id, x.score, x.criterio, 'sugerido'
  FROM (
    SELECT f.banco_id, f.sistema_id, f.score, f.criterio,
           row_number() OVER (PARTITION BY f.banco_id ORDER BY f.ord) AS rb,
           row_number() OVER (PARTITION BY f.sistema_id ORDER BY f.ord) AS rs
    FROM filtrado f
  ) x
  WHERE x.rb = 1 AND x.rs = 1;

  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;

GRANT EXECUTE ON FUNCTION public.cb_reemplazar_sugerencias(text, jsonb) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.cb_reemplazar_sugerencias(text, jsonb) FROM PUBLIC;

COMMENT ON FUNCTION public.cb_reemplazar_sugerencias(text, jsonb) IS
  'Reemplaza sugerencias del canal. Omite pares ya confirmados, duplicados en el lote y fechas a más de 4 días.';
