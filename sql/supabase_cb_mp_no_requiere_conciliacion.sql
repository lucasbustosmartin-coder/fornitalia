-- Mercado Pago: marcar un movimiento del extracto (Solo banco) como
-- "No requiere conciliación". Queda en la base con justificación; no se borra.

ALTER TABLE public.cb_movimiento
  ADD COLUMN IF NOT EXISTS no_requiere_conciliacion boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS no_requiere_justificacion text,
  ADD COLUMN IF NOT EXISTS no_requiere_at timestamptz,
  ADD COLUMN IF NOT EXISTS no_requiere_by uuid;

COMMENT ON COLUMN public.cb_movimiento.no_requiere_conciliacion IS
  'True si el movimiento del extracto no se concilia (p. ej. Mercado Pago Solo banco). No se elimina.';
COMMENT ON COLUMN public.cb_movimiento.no_requiere_justificacion IS
  'Motivo de no conciliar. Obligatorio al marcar.';
COMMENT ON COLUMN public.cb_movimiento.no_requiere_at IS
  'Instante en que se marcó no requiere conciliación.';
COMMENT ON COLUMN public.cb_movimiento.no_requiere_by IS
  'Usuario que marcó no requiere conciliación.';

CREATE INDEX IF NOT EXISTS idx_cb_movimiento_no_requiere
  ON public.cb_movimiento (canal, origen, fecha)
  WHERE no_requiere_conciliacion;

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
  IF v_mov.origen <> 'banco' OR v_mov.canal <> 'mercadopago' THEN
    RAISE EXCEPTION 'Solo se puede marcar No requiere conciliación en movimientos del extracto de Mercado Pago (solapa Solo banco).';
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
  IF v_mov.origen <> 'banco' OR v_mov.canal <> 'mercadopago' THEN
    RAISE EXCEPTION 'Solo aplica a movimientos del extracto de Mercado Pago.';
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

GRANT EXECUTE ON FUNCTION public.cb_marcar_no_requiere_conciliacion(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cb_deshacer_no_requiere_conciliacion(uuid) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.cb_marcar_no_requiere_conciliacion(uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.cb_deshacer_no_requiere_conciliacion(uuid) FROM PUBLIC;

COMMENT ON FUNCTION public.cb_marcar_no_requiere_conciliacion(uuid, text) IS
  'Marca un movimiento del extracto Mercado Pago como no conciliable, con justificación. No lo borra. Permiso confirmar_conciliacion_bancaria.';
COMMENT ON FUNCTION public.cb_deshacer_no_requiere_conciliacion(uuid) IS
  'Quita la marca No requiere conciliación y el movimiento vuelve a Solo banco.';
