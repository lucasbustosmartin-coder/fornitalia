-- Dos personas en Conciliación: entrar no reescribe sugerencias (eso lo hace el cliente).
-- Cuando sí se rearman (carga o Recalcular), esa escritura espera a quien está
-- confirmando el mismo canal, y no borra una sugerencia que esa persona ya tiene tomada.

CREATE OR REPLACE FUNCTION public.cb_lock_canal(p_canal text)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('fornitalia.cb.' || COALESCE(p_canal, '')));
END;
$$;

REVOKE ALL ON FUNCTION public.cb_lock_canal(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cb_lock_canal(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.cb_match_lock_canal()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.cb_lock_canal(COALESCE(NEW.canal, OLD.canal));
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_cb_match_lock_canal ON public.cb_match;
CREATE TRIGGER trg_cb_match_lock_canal
  BEFORE INSERT OR UPDATE OR DELETE
  ON public.cb_match
  FOR EACH ROW
  EXECUTE FUNCTION public.cb_match_lock_canal();

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
  IF p_canal IS NULL OR p_canal NOT IN ('mercadopago', 'galicia', 'galicia_usd', 'credicoop', 'fci_galicia', 'fci_galicia_usd') THEN
    RAISE EXCEPTION 'Canal inválido.';
  END IF;

  PERFORM public.cb_lock_canal(p_canal);

  WITH victimas AS (
    SELECT s.id
    FROM public.cb_match s
    WHERE s.canal = p_canal
      AND s.estado = 'sugerido'
    FOR UPDATE SKIP LOCKED
  )
  DELETE FROM public.cb_match m
  USING victimas v
  WHERE m.id = v.id;

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

COMMENT ON FUNCTION public.cb_reemplazar_sugerencias(text, jsonb) IS
  'Reemplaza sugerencias del canal. Espera si otra sesión está confirmando ese canal y no borra la fila que esa sesión ya tiene tomada.';
