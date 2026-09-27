-- No requiere conciliación: extracto (Solo banco) y tesorería (Solo sistema).
-- Mercado Pago, Galicia ARS y Galicia USD. No se borra el movimiento.

CREATE OR REPLACE FUNCTION public.cb_marcar_no_requiere_conciliacion(
  p_id uuid,
  p_justificacion text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_mov public.cb_movimiento%ROWTYPE;
  v_just text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sesión vencida. Recargá la página e iniciá sesión.' USING ERRCODE = '42501';
  END IF;
  IF NOT public.has_permission('confirmar_conciliacion_bancaria') THEN
    RAISE EXCEPTION 'Sin permiso para marcar que no requiere conciliación.' USING ERRCODE = '42501';
  END IF;
  IF p_id IS NULL THEN
    RAISE EXCEPTION 'Falta el movimiento.';
  END IF;

  v_just := NULLIF(btrim(COALESCE(p_justificacion, '')), '');
  IF v_just IS NULL OR char_length(v_just) < 8 THEN
    RAISE EXCEPTION 'La justificación es obligatoria (mínimo 8 caracteres).';
  END IF;

  SELECT * INTO v_mov FROM public.cb_movimiento WHERE id = p_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'El movimiento ya no existe.';
  END IF;
  IF v_mov.origen NOT IN ('banco', 'sistema')
     OR v_mov.canal NOT IN ('mercadopago', 'galicia', 'galicia_usd') THEN
    RAISE EXCEPTION 'Solo se puede marcar No requiere conciliación en extracto o tesorería (Mercado Pago, Galicia ARS o Galicia USD).';
  END IF;
  IF COALESCE(v_mov.pendiente_baja, false) THEN
    RAISE EXCEPTION 'Este movimiento está en A eliminar. Confirmá o descartá la baja primero.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.cb_match m
    WHERE m.estado = 'confirmado'
      AND (
        m.banco_id = p_id
        OR m.sistema_id = p_id
        OR public.cb_match_ids_lado(m, 'banco') && ARRAY[p_id]
        OR public.cb_match_ids_lado(m, 'sistema') && ARRAY[p_id]
      )
  ) THEN
    RAISE EXCEPTION 'Este movimiento ya está conciliado. Deshacé esa conciliación primero.';
  END IF;

  DELETE FROM public.cb_match
  WHERE estado IN ('sugerido', 'rechazado')
    AND (
      banco_id = p_id
      OR sistema_id = p_id
      OR COALESCE(banco_ids, ARRAY[]::uuid[]) && ARRAY[p_id]
      OR COALESCE(sistema_ids, ARRAY[]::uuid[]) && ARRAY[p_id]
    );

  UPDATE public.cb_movimiento
  SET no_requiere_conciliacion = true,
      no_requiere_justificacion = v_just,
      no_requiere_at = now(),
      no_requiere_by = auth.uid()
  WHERE id = p_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.cb_deshacer_no_requiere_conciliacion(p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_mov public.cb_movimiento%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sesión vencida. Recargá la página e iniciá sesión.' USING ERRCODE = '42501';
  END IF;
  IF NOT public.has_permission('confirmar_conciliacion_bancaria') THEN
    RAISE EXCEPTION 'Sin permiso para deshacer No requiere conciliación.' USING ERRCODE = '42501';
  END IF;
  IF p_id IS NULL THEN
    RAISE EXCEPTION 'Falta el movimiento.';
  END IF;

  SELECT * INTO v_mov FROM public.cb_movimiento WHERE id = p_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'El movimiento ya no existe.';
  END IF;
  IF v_mov.origen NOT IN ('banco', 'sistema')
     OR v_mov.canal NOT IN ('mercadopago', 'galicia', 'galicia_usd') THEN
    RAISE EXCEPTION 'Solo aplica a extracto o tesorería de Mercado Pago, Galicia ARS o Galicia USD.';
  END IF;
  IF NOT COALESCE(v_mov.no_requiere_conciliacion, false) THEN
    RAISE EXCEPTION 'Este movimiento no está marcado como No requiere conciliación.';
  END IF;

  UPDATE public.cb_movimiento
  SET no_requiere_conciliacion = false,
      no_requiere_justificacion = NULL,
      no_requiere_at = NULL,
      no_requiere_by = NULL
  WHERE id = p_id;
END;
$$;

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

GRANT EXECUTE ON FUNCTION public.cb_marcar_no_requiere_conciliacion(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cb_deshacer_no_requiere_conciliacion(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cb_marcar_no_requiere_conciliacion_lote(uuid[], text) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.cb_marcar_no_requiere_conciliacion(uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.cb_deshacer_no_requiere_conciliacion(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.cb_marcar_no_requiere_conciliacion_lote(uuid[], text) FROM PUBLIC;

COMMENT ON FUNCTION public.cb_marcar_no_requiere_conciliacion(uuid, text) IS
  'Marca un movimiento de extracto (Solo banco) o tesorería (Solo sistema) como no conciliable. No lo borra.';
COMMENT ON FUNCTION public.cb_deshacer_no_requiere_conciliacion(uuid) IS
  'Quita la marca No requiere conciliación; vuelve a Solo banco o Solo sistema.';
COMMENT ON FUNCTION public.cb_marcar_no_requiere_conciliacion_lote(uuid[], text) IS
  'Marca varios movimientos de extracto o tesorería como no conciliables, con una justificación.';
COMMENT ON COLUMN public.cb_movimiento.no_requiere_conciliacion IS
  'True si el movimiento (extracto o tesorería) no se concilia. No se elimina.';
