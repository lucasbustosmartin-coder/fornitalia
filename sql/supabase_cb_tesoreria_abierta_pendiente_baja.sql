-- Tesorería abierta (tesoreria_*.xlsx con Id): marcar Ids que ya no vienen
-- en el último archivo y confirmar la baja definitiva.

ALTER TABLE public.cb_movimiento
  ADD COLUMN IF NOT EXISTS pendiente_baja boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_cb_movimiento_pendiente_baja
  ON public.cb_movimiento (canal, origen)
  WHERE pendiente_baja;

CREATE OR REPLACE FUNCTION public.cb_es_tesoreria_abierta(p_mov public.cb_movimiento)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT p_mov.origen = 'sistema'
    AND p_mov.origen_id LIKE 'id|%'
    AND COALESCE(p_mov.raw->>'formato', '') <> 'cierre'
    AND COALESCE(p_mov.archivo, '') NOT ILIKE '%CIERRE%'
    AND (
      COALESCE(p_mov.raw->>'formato', '') = 'tesoreria'
      OR COALESCE(p_mov.archivo, '') ILIKE '%tesoreria_%'
    );
$$;

CREATE OR REPLACE FUNCTION public.cb_marcar_tesoreria_abierta_ausente(
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
  v_ids text[];
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

  v_ids := ARRAY(
    SELECT DISTINCT btrim(x)
    FROM unnest(COALESCE(p_origen_ids, ARRAY[]::text[])) AS x
    WHERE NULLIF(btrim(x), '') IS NOT NULL
  );

  UPDATE public.cb_movimiento m
  SET pendiente_baja = false
  WHERE m.canal = p_canal
    AND public.cb_es_tesoreria_abierta(m)
    AND m.origen_id = ANY (v_ids);

  UPDATE public.cb_movimiento m
  SET pendiente_baja = true
  WHERE m.canal = p_canal
    AND public.cb_es_tesoreria_abierta(m)
    AND COALESCE(cardinality(v_ids), 0) > 0
    AND NOT (m.origen_id = ANY (v_ids));

  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;

CREATE OR REPLACE FUNCTION public.cb_confirmar_baja_tesoreria(p_id uuid)
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
  IF NOT v_mov.pendiente_baja THEN
    RAISE EXCEPTION 'Este movimiento no está en la lista de bajas a confirmar.';
  END IF;
  IF NOT public.cb_es_tesoreria_abierta(v_mov) THEN
    RAISE EXCEPTION 'Solo se confirma la baja de tesorería abierta.';
  END IF;

  DELETE FROM public.cb_match m
  WHERE m.banco_id = p_id
     OR m.sistema_id = p_id
     OR COALESCE(m.banco_ids, ARRAY[]::uuid[]) && ARRAY[p_id]
     OR COALESCE(m.sistema_ids, ARRAY[]::uuid[]) && ARRAY[p_id];

  DELETE FROM public.cb_movimiento WHERE id = p_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.cb_marcar_tesoreria_abierta_ausente(text, text[]) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.cb_marcar_tesoreria_abierta_ausente(text, text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cb_confirmar_baja_tesoreria(uuid) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.cb_confirmar_baja_tesoreria(uuid) FROM PUBLIC;

COMMENT ON COLUMN public.cb_movimiento.pendiente_baja IS
  'Tesorería abierta cuyo Id no vino en el último tesoreria_*.xlsx; espera confirmación de baja.';
COMMENT ON FUNCTION public.cb_marcar_tesoreria_abierta_ausente(text, text[]) IS
  'Marca tesorería abierta del canal cuyo origen_id no está en el archivo subido.';
COMMENT ON FUNCTION public.cb_confirmar_baja_tesoreria(uuid) IS
  'Elimina tesorería abierta marcada a baja (y sus parejas). Permiso cargar_conciliacion_bancaria.';
