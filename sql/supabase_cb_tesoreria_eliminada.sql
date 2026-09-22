-- Archivo de tesorería eliminada (Solo sistema, baja confirmada o reemplazo por cierre/Id).
-- La solapa Tesorería eliminada lista estas filas; no se restauran solas.

CREATE TABLE IF NOT EXISTS public.cb_movimiento_eliminado (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  movimiento_id uuid NOT NULL,
  canal text NOT NULL CHECK (canal IN ('mercadopago', 'galicia', 'galicia_usd')),
  origen text NOT NULL DEFAULT 'sistema',
  origen_id text,
  fecha date,
  fecha_hora timestamptz,
  tipo text,
  descripcion text,
  contraparte text,
  monto numeric(18,2),
  moneda text,
  categoria text,
  cuenta_contable text,
  credito numeric(18,2),
  debito numeric(18,2),
  saldo numeric(18,2),
  id_operacion_relacionada text,
  id_movimiento_banco text,
  archivo text,
  fila_excel integer,
  raw jsonb,
  created_at timestamptz,
  created_by uuid,
  pendiente_baja boolean,
  motivo text NOT NULL CHECK (motivo IN ('solo_sistema', 'baja_tesoreria', 'reemplazo_cierre')),
  eliminado_at timestamptz NOT NULL DEFAULT now(),
  eliminado_by uuid
);

CREATE INDEX IF NOT EXISTS idx_cb_movimiento_eliminado_canal
  ON public.cb_movimiento_eliminado (canal, eliminado_at DESC);

COMMENT ON TABLE public.cb_movimiento_eliminado IS
  'Copia de tesorería borrada de cb_movimiento. motivo: solo_sistema, baja_tesoreria o reemplazo_cierre.';

ALTER TABLE public.cb_movimiento_eliminado ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.cb_movimiento_eliminado FROM anon;
GRANT SELECT ON TABLE public.cb_movimiento_eliminado TO authenticated;

DROP POLICY IF EXISTS cb_movimiento_eliminado_select ON public.cb_movimiento_eliminado;
CREATE POLICY cb_movimiento_eliminado_select ON public.cb_movimiento_eliminado FOR SELECT TO authenticated
  USING (public.has_permission('ver_conciliacion_bancaria'));

CREATE OR REPLACE FUNCTION public.cb_archivar_tesoreria(p_mov public.cb_movimiento, p_motivo text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_mov.id IS NULL THEN
    RETURN;
  END IF;
  INSERT INTO public.cb_movimiento_eliminado (
    movimiento_id, canal, origen, origen_id, fecha, fecha_hora, tipo, descripcion,
    contraparte, monto, moneda, categoria, cuenta_contable, credito, debito, saldo,
    id_operacion_relacionada, id_movimiento_banco, archivo, fila_excel, raw,
    created_at, created_by, pendiente_baja, motivo, eliminado_by
  ) VALUES (
    p_mov.id, p_mov.canal, p_mov.origen, p_mov.origen_id, p_mov.fecha, p_mov.fecha_hora,
    p_mov.tipo, p_mov.descripcion, p_mov.contraparte, p_mov.monto, p_mov.moneda,
    p_mov.categoria, p_mov.cuenta_contable, p_mov.credito, p_mov.debito, p_mov.saldo,
    p_mov.id_operacion_relacionada, p_mov.id_movimiento_banco, p_mov.archivo, p_mov.fila_excel,
    p_mov.raw, p_mov.created_at, p_mov.created_by, p_mov.pendiente_baja, p_motivo, auth.uid()
  );
END;
$$;

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

  PERFORM public.cb_archivar_tesoreria(v_mov, 'solo_sistema');
  DELETE FROM public.cb_movimiento WHERE id = p_id;
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

  PERFORM public.cb_archivar_tesoreria(v_mov, 'baja_tesoreria');
  DELETE FROM public.cb_movimiento WHERE id = p_id;
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
  IF p_canal IS NULL OR p_canal NOT IN ('mercadopago', 'galicia', 'galicia_usd') THEN
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

  INSERT INTO public.cb_movimiento_eliminado (
    movimiento_id, canal, origen, origen_id, fecha, fecha_hora, tipo, descripcion,
    contraparte, monto, moneda, categoria, cuenta_contable, credito, debito, saldo,
    id_operacion_relacionada, id_movimiento_banco, archivo, fila_excel, raw,
    created_at, created_by, pendiente_baja, motivo, eliminado_by
  )
  SELECT
    m.id, m.canal, m.origen, m.origen_id, m.fecha, m.fecha_hora, m.tipo, m.descripcion,
    m.contraparte, m.monto, m.moneda, m.categoria, m.cuenta_contable, m.credito, m.debito, m.saldo,
    m.id_operacion_relacionada, m.id_movimiento_banco, m.archivo, m.fila_excel, m.raw,
    m.created_at, m.created_by, m.pendiente_baja, 'reemplazo_cierre', auth.uid()
  FROM public.cb_movimiento m
  WHERE m.id = ANY (ids);

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

REVOKE EXECUTE ON FUNCTION public.cb_archivar_tesoreria(public.cb_movimiento, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.cb_archivar_tesoreria(public.cb_movimiento, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cb_borrar_movimiento_sistema(uuid) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.cb_borrar_movimiento_sistema(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cb_confirmar_baja_tesoreria(uuid) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.cb_confirmar_baja_tesoreria(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cb_retirar_tesoreria_duplicada_por_cierre(text, text[]) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.cb_retirar_tesoreria_duplicada_por_cierre(text, text[]) FROM PUBLIC;

COMMENT ON FUNCTION public.cb_borrar_movimiento_sistema(uuid) IS
  'Elimina tesorería no conciliada y la deja en cb_movimiento_eliminado (motivo solo_sistema).';
COMMENT ON FUNCTION public.cb_confirmar_baja_tesoreria(uuid) IS
  'Confirma baja de tesorería abierta y la archiva (motivo baja_tesoreria).';
COMMENT ON FUNCTION public.cb_retirar_tesoreria_duplicada_por_cierre(text, text[]) IS
  'Tras cargar tesorería con Id, archiva y borra hash tes| del mismo fecha/monto/descripcion/cliente.';
