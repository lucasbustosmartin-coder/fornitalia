-- Tesorería Status Anulado no vive en conciliación ni en cajas físicas.
-- Limpieza de lo ya cargado + RPC para que un upload posterior no lo reintroduzca
-- (si el Id ya existía, se retira y se deshace la conciliación asociada).

DELETE FROM public.cb_match m
WHERE EXISTS (
  SELECT 1 FROM public.cb_movimiento s
  WHERE s.origen = 'sistema'
    AND coalesce(s.raw->>'status', s.raw->>'Status') ILIKE '%anul%'
    AND (
      m.banco_id = s.id OR m.sistema_id = s.id
      OR coalesce(m.banco_ids, ARRAY[]::uuid[]) && ARRAY[s.id]
      OR coalesce(m.sistema_ids, ARRAY[]::uuid[]) && ARRAY[s.id]
    )
);

DELETE FROM public.cb_movimiento
WHERE origen = 'sistema'
  AND coalesce(raw->>'status', raw->>'Status') ILIKE '%anul%';

DELETE FROM public.cf_movimiento
WHERE coalesce(raw->>'status', raw->>'Status') ILIKE '%anul%';


CREATE OR REPLACE FUNCTION public.cb_borrar_tesoreria_anulada(p_origen_ids text[])
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
    RAISE EXCEPTION 'Sin permiso para eliminar movimientos de tesorería.' USING ERRCODE = '42501';
  END IF;
  IF p_origen_ids IS NULL OR cardinality(p_origen_ids) = 0 THEN
    RETURN 0;
  END IF;

  SELECT coalesce(array_agg(id), ARRAY[]::uuid[])
    INTO ids
  FROM public.cb_movimiento
  WHERE origen = 'sistema'
    AND origen_id = ANY (p_origen_ids);

  IF ids IS NULL OR cardinality(ids) = 0 THEN
    RETURN 0;
  END IF;

  DELETE FROM public.cb_match m
  WHERE m.banco_id = ANY (ids)
     OR m.sistema_id = ANY (ids)
     OR coalesce(m.banco_ids, ARRAY[]::uuid[]) && ids
     OR coalesce(m.sistema_ids, ARRAY[]::uuid[]) && ids;

  DELETE FROM public.cb_movimiento
  WHERE id = ANY (ids);
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;

GRANT EXECUTE ON FUNCTION public.cb_borrar_tesoreria_anulada(text[]) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.cb_borrar_tesoreria_anulada(text[]) FROM PUBLIC;

COMMENT ON FUNCTION public.cb_borrar_tesoreria_anulada(text[]) IS
  'Quita tesorería sistema cuyos origen_id vinieron Anulado en el Excel; borra también las parejas de conciliación.';

CREATE OR REPLACE FUNCTION public.cf_borrar_tesoreria_anulada(p_origen_ids text[])
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  n integer := 0;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sesión vencida. Recargá la página e iniciá sesión.' USING ERRCODE = '42501';
  END IF;
  IF NOT public.has_permission('cargar_cajas_fisicas') THEN
    RAISE EXCEPTION 'Sin permiso para eliminar movimientos de caja.' USING ERRCODE = '42501';
  END IF;
  IF p_origen_ids IS NULL OR cardinality(p_origen_ids) = 0 THEN
    RETURN 0;
  END IF;

  DELETE FROM public.cf_movimiento
  WHERE origen_id = ANY (p_origen_ids);
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;

GRANT EXECUTE ON FUNCTION public.cf_borrar_tesoreria_anulada(text[]) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.cf_borrar_tesoreria_anulada(text[]) FROM PUBLIC;

COMMENT ON FUNCTION public.cf_borrar_tesoreria_anulada(text[]) IS
  'Quita movimientos de cajas físicas cuyos origen_id vinieron Anulado en el Excel.';
