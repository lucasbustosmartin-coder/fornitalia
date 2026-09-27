-- Mercado Pago / Galicia Solo banco: marcar varios movimientos del extracto
-- como "No requiere conciliación" con una sola justificación (set-based, sin timeout).

CREATE OR REPLACE FUNCTION public.cb_marcar_no_requiere_conciliacion_lote(
  p_ids uuid[],
  p_justificacion text
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET statement_timeout = '60s'
SET lock_timeout = '30s'
AS $$
DECLARE
  v_just text;
  v_ids uuid[];
  v_n integer := 0;
  v_conf integer := 0;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sesión vencida. Recargá la página e iniciá sesión.' USING ERRCODE = '42501';
  END IF;
  IF NOT public.has_permission('confirmar_conciliacion_bancaria') THEN
    RAISE EXCEPTION 'Sin permiso para marcar que no requiere conciliación.' USING ERRCODE = '42501';
  END IF;

  v_just := NULLIF(btrim(COALESCE(p_justificacion, '')), '');
  IF v_just IS NULL OR char_length(v_just) < 8 THEN
    RAISE EXCEPTION 'La justificación es obligatoria (mínimo 8 caracteres).';
  END IF;

  SELECT ARRAY_AGG(DISTINCT x)
    INTO v_ids
  FROM unnest(COALESCE(p_ids, ARRAY[]::uuid[])) AS x
  WHERE x IS NOT NULL;

  IF v_ids IS NULL OR cardinality(v_ids) = 0 THEN
    RAISE EXCEPTION 'Falta al menos un movimiento.';
  END IF;
  IF cardinality(v_ids) > 2000 THEN
    RAISE EXCEPTION 'Máximo 2000 movimientos por vez.';
  END IF;

  SELECT COUNT(*) INTO v_conf
  FROM public.cb_match m
  WHERE m.estado = 'confirmado'
    AND (
      m.banco_id = ANY (v_ids)
      OR m.sistema_id = ANY (v_ids)
      OR COALESCE(m.banco_ids, ARRAY[]::uuid[]) && v_ids
      OR COALESCE(m.sistema_ids, ARRAY[]::uuid[]) && v_ids
    );
  IF v_conf > 0 THEN
    RAISE EXCEPTION 'Hay % movimiento(s) ya conciliado(s). Deshacé esa conciliación primero.', v_conf;
  END IF;

  DELETE FROM public.cb_match
  WHERE estado IN ('sugerido', 'rechazado')
    AND (
      banco_id = ANY (v_ids)
      OR sistema_id = ANY (v_ids)
      OR COALESCE(banco_ids, ARRAY[]::uuid[]) && v_ids
      OR COALESCE(sistema_ids, ARRAY[]::uuid[]) && v_ids
    );

  UPDATE public.cb_movimiento
  SET no_requiere_conciliacion = true,
      no_requiere_justificacion = v_just,
      no_requiere_at = now(),
      no_requiere_by = auth.uid()
  WHERE id = ANY (v_ids)
    AND origen IN ('banco', 'sistema')
    AND canal IN ('mercadopago', 'galicia', 'galicia_usd')
    AND COALESCE(pendiente_baja, false) = false;

  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n = 0 THEN
    RAISE EXCEPTION 'No hay movimientos de extracto o tesorería para marcar (Mercado Pago, Galicia ARS o Galicia USD).';
  END IF;
  RETURN v_n;
END;
$$;

GRANT EXECUTE ON FUNCTION public.cb_marcar_no_requiere_conciliacion_lote(uuid[], text) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.cb_marcar_no_requiere_conciliacion_lote(uuid[], text) FROM PUBLIC;

COMMENT ON FUNCTION public.cb_marcar_no_requiere_conciliacion_lote(uuid[], text) IS
  'Marca varios movimientos del extracto (Mercado Pago, Galicia ARS o Galicia USD) como no conciliables, con una justificación. Una sola actualización. No los borra. Permiso confirmar_conciliacion_bancaria.';
