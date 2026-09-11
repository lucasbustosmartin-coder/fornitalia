-- Eliminar un movimiento de tesorería (solapa Solo sistema).
-- Requiere sql/supabase_conciliacion_bancaria.sql y sql/supabase_conciliacion_bancaria_manual_grupo.sql.

CREATE OR REPLACE FUNCTION public.cb_borrar_movimiento_sistema(p_id uuid)
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
  IF NOT public.has_permission('cargar_conciliacion_bancaria') THEN
    RAISE EXCEPTION 'Sin permiso para eliminar movimientos de tesorería.' USING ERRCODE = '42501';
  END IF;
  IF p_id IS NULL THEN
    RAISE EXCEPTION 'Falta el movimiento a eliminar.';
  END IF;

  SELECT * INTO v_mov FROM public.cb_movimiento WHERE id = p_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'El movimiento ya no existe.';
  END IF;
  IF v_mov.origen <> 'sistema' THEN
    RAISE EXCEPTION 'Solo se pueden eliminar movimientos de tesorería (solapa Solo sistema).';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.cb_match m
    WHERE m.estado IN ('sugerido', 'confirmado')
      AND (
        m.banco_id = p_id
        OR m.sistema_id = p_id
        OR public.cb_match_ids_lado(m, 'banco') && ARRAY[p_id]
        OR public.cb_match_ids_lado(m, 'sistema') && ARRAY[p_id]
      )
  ) THEN
    RAISE EXCEPTION 'Este movimiento está en una conciliación activa. Deshacé o descartá esa pareja primero.';
  END IF;

  DELETE FROM public.cb_match
  WHERE estado = 'rechazado'
    AND (
      banco_id = p_id
      OR sistema_id = p_id
      OR COALESCE(banco_ids, ARRAY[]::uuid[]) && ARRAY[p_id]
      OR COALESCE(sistema_ids, ARRAY[]::uuid[]) && ARRAY[p_id]
    );

  DELETE FROM public.cb_movimiento WHERE id = p_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.cb_borrar_movimiento_sistema(uuid) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.cb_borrar_movimiento_sistema(uuid) FROM PUBLIC;

COMMENT ON FUNCTION public.cb_borrar_movimiento_sistema(uuid) IS
  'Elimina un movimiento de tesorería que no está en sugerido/confirmado. Permiso cargar_conciliacion_bancaria.';
