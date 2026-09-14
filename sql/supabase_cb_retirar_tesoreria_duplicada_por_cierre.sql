-- Al recargar un cierre de caja con Id único, quita tesorería vieja (tesoreria_*.xlsx)
-- del mismo canal que coincide en fecha, monto, descripción, categoría y cliente,
-- para no dejar el mismo movimiento dos veces (una con hash y otra con Id).

CREATE OR REPLACE FUNCTION public.cb_retirar_tesoreria_duplicada_por_cierre(
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
  ids uuid[];
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

  SELECT coalesce(array_agg(s.id), ARRAY[]::uuid[])
  INTO ids
  FROM public.cb_movimiento s
  WHERE s.canal = p_canal
    AND s.origen = 'sistema'
    AND s.origen_id NOT LIKE 'cierre|%'
    AND EXISTS (
      SELECT 1
      FROM public.cb_movimiento c
      WHERE c.canal = p_canal
        AND c.origen = 'sistema'
        AND c.origen_id = ANY (COALESCE(p_origen_ids, ARRAY[]::text[]))
        AND c.origen_id LIKE 'cierre|%'
        AND c.fecha = s.fecha
        AND c.monto = s.monto
        AND COALESCE(c.descripcion, '') = COALESCE(s.descripcion, '')
        AND COALESCE(c.categoria, '') = COALESCE(s.categoria, '')
        AND COALESCE(c.contraparte, '') = COALESCE(s.contraparte, '')
    );

  IF ids IS NULL OR coalesce(array_length(ids, 1), 0) = 0 THEN
    RETURN 0;
  END IF;

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

GRANT EXECUTE ON FUNCTION public.cb_retirar_tesoreria_duplicada_por_cierre(text, text[]) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.cb_retirar_tesoreria_duplicada_por_cierre(text, text[]) FROM PUBLIC;

COMMENT ON FUNCTION public.cb_retirar_tesoreria_duplicada_por_cierre(text, text[]) IS
  'Tras cargar un cierre con Id, elimina tesorería del mismo canal sin ese Id que duplica fecha/monto/descripcion/categoría/cliente.';
