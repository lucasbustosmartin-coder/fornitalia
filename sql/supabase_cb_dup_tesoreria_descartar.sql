-- Conciliación Bancaria: descartar un grupo de tesorería marcado como
-- potencial duplicado (mismo importe, ≤ 40 días). Queda persistido por
-- el conjunto de IDs; no vuelve a listarse. Si entra un movimiento nuevo
-- al grupo, ese conjunto distinto sí se vuelve a mostrar.
-- Deshacer vuelve a listarlo.

CREATE TABLE IF NOT EXISTS public.cb_dup_descartado (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  canal text NOT NULL CHECK (canal IN ('mercadopago', 'galicia', 'galicia_usd')),
  ids_key text NOT NULL,
  movimiento_ids uuid[] NOT NULL,
  monto numeric(18,2),
  descartado_at timestamptz NOT NULL DEFAULT now(),
  descartado_by uuid,
  CONSTRAINT cb_dup_descartado_unica UNIQUE (canal, ids_key),
  CONSTRAINT cb_dup_descartado_min_ids CHECK (cardinality(movimiento_ids) >= 2)
);

CREATE INDEX IF NOT EXISTS idx_cb_dup_descartado_canal
  ON public.cb_dup_descartado (canal, descartado_at DESC);

COMMENT ON TABLE public.cb_dup_descartado IS
  'Grupos de tesorería descartados como potencial duplicado. ids_key = UUIDs ordenados unidos por |. Un superconjunto nuevo (otro movimiento) no está cubierto por esta fila.';

ALTER TABLE public.cb_dup_descartado ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.cb_dup_descartado FROM anon;
GRANT SELECT, INSERT, DELETE ON TABLE public.cb_dup_descartado TO authenticated;

DROP POLICY IF EXISTS cb_dup_descartado_select ON public.cb_dup_descartado;
CREATE POLICY cb_dup_descartado_select ON public.cb_dup_descartado FOR SELECT TO authenticated
  USING (public.has_permission('ver_conciliacion_bancaria'));

DROP POLICY IF EXISTS cb_dup_descartado_insert ON public.cb_dup_descartado;
CREATE POLICY cb_dup_descartado_insert ON public.cb_dup_descartado FOR INSERT TO authenticated
  WITH CHECK (public.has_permission('confirmar_conciliacion_bancaria'));

DROP POLICY IF EXISTS cb_dup_descartado_delete ON public.cb_dup_descartado;
CREATE POLICY cb_dup_descartado_delete ON public.cb_dup_descartado FOR DELETE TO authenticated
  USING (public.has_permission('confirmar_conciliacion_bancaria'));

CREATE OR REPLACE FUNCTION public.cb_descartar_dup_tesoreria(
  p_canal text,
  p_ids uuid[]
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ids uuid[];
  v_key text;
  v_n int;
  v_ok int;
  v_monto numeric(18,2);
  v_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sesión vencida. Recargá la página e iniciá sesión.' USING ERRCODE = '42501';
  END IF;
  IF NOT public.has_permission('confirmar_conciliacion_bancaria') THEN
    RAISE EXCEPTION 'Sin permiso para descartar duplicados de tesorería.' USING ERRCODE = '42501';
  END IF;
  IF p_canal IS NULL OR p_canal NOT IN ('mercadopago', 'galicia', 'galicia_usd') THEN
    RAISE EXCEPTION 'Canal inválido.';
  END IF;

  SELECT ARRAY(
    SELECT DISTINCT x
    FROM unnest(COALESCE(p_ids, ARRAY[]::uuid[])) AS x
    WHERE x IS NOT NULL
    ORDER BY x
  ) INTO v_ids;

  v_n := COALESCE(cardinality(v_ids), 0);
  IF v_n < 2 THEN
    RAISE EXCEPTION 'Hace falta un grupo de al menos dos movimientos de tesorería.';
  END IF;

  SELECT COUNT(*)::int INTO v_ok
  FROM public.cb_movimiento m
  WHERE m.id = ANY (v_ids)
    AND m.canal = p_canal
    AND m.origen = 'sistema';

  IF v_ok <> v_n THEN
    RAISE EXCEPTION 'Uno o más movimientos no son tesorería de este canal o ya no existen.';
  END IF;

  SELECT m.monto INTO v_monto
  FROM public.cb_movimiento m
  WHERE m.id = v_ids[1];

  v_key := array_to_string(v_ids, '|');

  INSERT INTO public.cb_dup_descartado (canal, ids_key, movimiento_ids, monto, descartado_by)
  VALUES (p_canal, v_key, v_ids, v_monto, auth.uid())
  ON CONFLICT (canal, ids_key) DO UPDATE
    SET descartado_at = now(),
        descartado_by = auth.uid(),
        monto = EXCLUDED.monto
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.cb_deshacer_dup_tesoreria(p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sesión vencida. Recargá la página e iniciá sesión.' USING ERRCODE = '42501';
  END IF;
  IF NOT public.has_permission('confirmar_conciliacion_bancaria') THEN
    RAISE EXCEPTION 'Sin permiso para deshacer el descarte de duplicados.' USING ERRCODE = '42501';
  END IF;
  IF p_id IS NULL THEN
    RAISE EXCEPTION 'Falta el grupo descartado.';
  END IF;
  DELETE FROM public.cb_dup_descartado WHERE id = p_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ese descarte ya no existe.';
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.cb_descartar_dup_tesoreria(text, uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cb_deshacer_dup_tesoreria(uuid) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.cb_descartar_dup_tesoreria(text, uuid[]) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.cb_deshacer_dup_tesoreria(uuid) FROM PUBLIC;

COMMENT ON FUNCTION public.cb_descartar_dup_tesoreria(text, uuid[]) IS
  'Persiste un grupo de tesorería para que no vuelva a listarse como potencial duplicado.';
COMMENT ON FUNCTION public.cb_deshacer_dup_tesoreria(uuid) IS
  'Quita el descarte y el grupo vuelve a Potenciales duplicados.';
