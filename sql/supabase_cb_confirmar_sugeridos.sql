-- Confirmar en lote las sugerencias visibles de Conciliación Bancaria.

CREATE OR REPLACE FUNCTION public.cb_confirmar_sugeridos(p_canal text, p_ids uuid[])
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_n integer;
  v_ids uuid[];
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sesión vencida. Recargá la página e iniciá sesión.' USING ERRCODE = '42501';
  END IF;
  IF NOT public.has_permission('confirmar_conciliacion_bancaria') THEN
    RAISE EXCEPTION 'Sin permiso para confirmar conciliación.' USING ERRCODE = '42501';
  END IF;
  IF p_canal IS NULL OR p_canal NOT IN ('mercadopago', 'galicia') THEN
    RAISE EXCEPTION 'Canal inválido.';
  END IF;

  SELECT ARRAY(
    SELECT DISTINCT x FROM unnest(COALESCE(p_ids, ARRAY[]::uuid[])) AS x WHERE x IS NOT NULL
  ) INTO v_ids;
  IF COALESCE(cardinality(v_ids), 0) < 1 THEN
    RETURN 0;
  END IF;

  UPDATE public.cb_match m
  SET estado = 'confirmado',
      confirmado_at = now(),
      confirmado_by = auth.uid()
  WHERE m.canal = p_canal
    AND m.estado = 'sugerido'
    AND m.criterio IS DISTINCT FROM 'impuestos'
    AND m.id = ANY (v_ids);

  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END;
$$;

GRANT EXECUTE ON FUNCTION public.cb_confirmar_sugeridos(text, uuid[]) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.cb_confirmar_sugeridos(text, uuid[]) FROM PUBLIC;

COMMENT ON FUNCTION public.cb_confirmar_sugeridos(text, uuid[]) IS
  'Confirma en lote sugerencias de Conciliación Bancaria (solo estado sugerido del canal).';
