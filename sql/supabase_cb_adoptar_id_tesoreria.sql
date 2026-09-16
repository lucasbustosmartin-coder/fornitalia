-- Si ya existe tesorería sin Id (origen_id tes|…) del mismo movimiento, le asigna
-- origen_id id|{Id} para que el upsert actualice ese registro (uuid y conciliación se conservan).
-- No exige misma categoría/cuenta: eso es lo que suele cambiar entre exportaciones.

CREATE OR REPLACE FUNCTION public.cb_adoptar_id_tesoreria(
  p_canal text,
  p_filas jsonb
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
  x jsonb;
  v_oid text;
  v_upd integer;
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

  FOR x IN SELECT value FROM jsonb_array_elements(COALESCE(p_filas, '[]'::jsonb))
  LOOP
    v_oid := NULLIF(btrim(x->>'origen_id'), '');
    IF v_oid IS NULL OR (v_oid NOT LIKE 'id|%' AND v_oid NOT LIKE 'cierre|%') THEN
      CONTINUE;
    END IF;
    IF EXISTS (
      SELECT 1 FROM public.cb_movimiento o
      WHERE o.canal = p_canal AND o.origen = 'sistema' AND o.origen_id = v_oid
    ) THEN
      CONTINUE;
    END IF;

    UPDATE public.cb_movimiento s
    SET origen_id = v_oid
    WHERE s.id = (
      SELECT s2.id
      FROM public.cb_movimiento s2
      WHERE s2.canal = p_canal
        AND s2.origen = 'sistema'
        AND s2.origen_id NOT LIKE 'id|%'
        AND s2.origen_id NOT LIKE 'cierre|%'
        AND s2.fecha = COALESCE(NULLIF(btrim(x->>'fecha'), '')::date, s2.fecha)
        AND s2.monto = ROUND(COALESCE((x->>'monto')::numeric, 0), 2)
        AND COALESCE(s2.descripcion, '') = COALESCE(NULLIF(btrim(x->>'descripcion'), ''), '')
        AND COALESCE(s2.contraparte, '') = COALESCE(NULLIF(btrim(x->>'contraparte'), ''), '')
      ORDER BY s2.updated_at DESC
      LIMIT 1
    );
    GET DIAGNOSTICS v_upd = ROW_COUNT;
    n := n + v_upd;
  END LOOP;

  RETURN n;
END;
$$;

GRANT EXECUTE ON FUNCTION public.cb_adoptar_id_tesoreria(text, jsonb) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.cb_adoptar_id_tesoreria(text, jsonb) FROM PUBLIC;

COMMENT ON FUNCTION public.cb_adoptar_id_tesoreria(text, jsonb) IS
  'Asigna origen_id id|{Id} a tesorería hash del mismo fecha/monto/descripcion/cliente para que el upsert no duplique.';
