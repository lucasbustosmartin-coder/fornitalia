-- Conciliación Mercado Pago: deshacer un par autoanulado
-- (misma operación relacionada e importes opuestos).
-- El par deja de ir a Anulados y los dos movimientos vuelven al extracto.
-- Volver a anular borra esta fila y el par se arma otra vez.

CREATE TABLE IF NOT EXISTS public.cb_mp_anulacion_deshecha (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  canal text NOT NULL DEFAULT 'mercadopago' CHECK (canal = 'mercadopago'),
  ids_key text NOT NULL,
  movimiento_ids uuid[] NOT NULL,
  op_rel text,
  deshecho_at timestamptz NOT NULL DEFAULT now(),
  deshecho_by uuid,
  CONSTRAINT cb_mp_anulacion_deshecha_unica UNIQUE (canal, ids_key),
  CONSTRAINT cb_mp_anulacion_deshecha_dos CHECK (cardinality(movimiento_ids) = 2)
);

CREATE INDEX IF NOT EXISTS idx_cb_mp_anulacion_deshecha_canal
  ON public.cb_mp_anulacion_deshecha (canal, deshecho_at DESC);

COMMENT ON TABLE public.cb_mp_anulacion_deshecha IS
  'Pares del extracto Mercado Pago que el usuario sacó de Anulados. ids_key = los dos UUID ordenados unidos por |.';

ALTER TABLE public.cb_mp_anulacion_deshecha ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.cb_mp_anulacion_deshecha FROM anon;
GRANT SELECT, INSERT, DELETE ON TABLE public.cb_mp_anulacion_deshecha TO authenticated;

DROP POLICY IF EXISTS cb_mp_anulacion_deshecha_select ON public.cb_mp_anulacion_deshecha;
CREATE POLICY cb_mp_anulacion_deshecha_select ON public.cb_mp_anulacion_deshecha
  FOR SELECT TO authenticated
  USING (public.has_permission('ver_conciliacion_bancaria'));

DROP POLICY IF EXISTS cb_mp_anulacion_deshecha_insert ON public.cb_mp_anulacion_deshecha;
CREATE POLICY cb_mp_anulacion_deshecha_insert ON public.cb_mp_anulacion_deshecha
  FOR INSERT TO authenticated
  WITH CHECK (public.has_permission('confirmar_conciliacion_bancaria'));

DROP POLICY IF EXISTS cb_mp_anulacion_deshecha_delete ON public.cb_mp_anulacion_deshecha;
CREATE POLICY cb_mp_anulacion_deshecha_delete ON public.cb_mp_anulacion_deshecha
  FOR DELETE TO authenticated
  USING (public.has_permission('confirmar_conciliacion_bancaria'));

CREATE OR REPLACE FUNCTION public.cb_deshacer_anulacion_mp(
  p_id_a uuid,
  p_id_b uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ids uuid[];
  v_key text;
  v_a public.cb_movimiento%ROWTYPE;
  v_b public.cb_movimiento%ROWTYPE;
  v_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sesión vencida. Recargá la página e iniciá sesión.' USING ERRCODE = '42501';
  END IF;
  IF NOT public.has_permission('confirmar_conciliacion_bancaria') THEN
    RAISE EXCEPTION 'Sin permiso para deshacer una anulación de Mercado Pago.' USING ERRCODE = '42501';
  END IF;
  IF p_id_a IS NULL OR p_id_b IS NULL OR p_id_a = p_id_b THEN
    RAISE EXCEPTION 'Faltan los dos movimientos del par.';
  END IF;

  SELECT * INTO v_a FROM public.cb_movimiento WHERE id = p_id_a;
  SELECT * INTO v_b FROM public.cb_movimiento WHERE id = p_id_b;
  IF v_a.id IS NULL OR v_b.id IS NULL THEN
    RAISE EXCEPTION 'Uno de los movimientos ya no está en el extracto.';
  END IF;
  IF v_a.canal <> 'mercadopago' OR v_b.canal <> 'mercadopago'
     OR v_a.origen <> 'banco' OR v_b.origen <> 'banco' THEN
    RAISE EXCEPTION 'Los dos movimientos tienen que ser del extracto de Mercado Pago.';
  END IF;
  IF btrim(coalesce(v_a.id_operacion_relacionada, '')) = ''
     OR btrim(v_a.id_operacion_relacionada) IS DISTINCT FROM btrim(coalesce(v_b.id_operacion_relacionada, '')) THEN
    RAISE EXCEPTION 'No comparten la operación relacionada.';
  END IF;
  IF v_a.monto IS NULL OR v_b.monto IS NULL OR round(v_a.monto + v_b.monto, 2) <> 0 THEN
    RAISE EXCEPTION 'Los importes no se anulan entre sí.';
  END IF;

  SELECT ARRAY(SELECT x FROM unnest(ARRAY[p_id_a, p_id_b]) AS x ORDER BY x) INTO v_ids;
  v_key := array_to_string(v_ids, '|');

  INSERT INTO public.cb_mp_anulacion_deshecha (canal, ids_key, movimiento_ids, op_rel, deshecho_by)
  VALUES ('mercadopago', v_key, v_ids, btrim(v_a.id_operacion_relacionada), auth.uid())
  ON CONFLICT (canal, ids_key) DO UPDATE
    SET deshecho_at = now(),
        deshecho_by = auth.uid(),
        op_rel = EXCLUDED.op_rel
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.cb_reanular_mp(p_id uuid)
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
    RAISE EXCEPTION 'Sin permiso para volver a anular un movimiento de Mercado Pago.' USING ERRCODE = '42501';
  END IF;
  IF p_id IS NULL THEN
    RAISE EXCEPTION 'Falta la anulación deshecha.';
  END IF;
  DELETE FROM public.cb_mp_anulacion_deshecha WHERE id = p_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Esa anulación deshecha ya no existe.';
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.cb_deshacer_anulacion_mp(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cb_reanular_mp(uuid) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.cb_deshacer_anulacion_mp(uuid, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.cb_reanular_mp(uuid) FROM PUBLIC;

COMMENT ON FUNCTION public.cb_deshacer_anulacion_mp(uuid, uuid) IS
  'Saca un par autoanulado de Mercado Pago: los dos movimientos vuelven al extracto.';
COMMENT ON FUNCTION public.cb_reanular_mp(uuid) IS
  'Vuelve a tratar el par como anulado y lo saca de la conciliación.';
