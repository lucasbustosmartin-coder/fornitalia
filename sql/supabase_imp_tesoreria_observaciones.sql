-- Impuestos: el listado de tesorería MP incluye Observaciones (raw.observaciones).
DROP FUNCTION IF EXISTS public.imp_listar_tesoreria_mp();

CREATE FUNCTION public.imp_listar_tesoreria_mp()
RETURNS TABLE (
  id uuid,
  fecha date,
  monto numeric,
  descripcion text,
  categoria text,
  cuenta_contable text,
  origen_id text,
  contraparte text,
  es_impuesto boolean,
  usado_impuestos boolean,
  observaciones text
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sesión vencida. Recargá la página e iniciá sesión.' USING ERRCODE = '42501';
  END IF;
  IF NOT public.has_permission('ver_impuestos') THEN
    RAISE EXCEPTION 'Sin permiso para ver impuestos.' USING ERRCODE = '42501';
  END IF;
  IF NOT public.has_permission('cargar_impuestos') THEN
    RAISE EXCEPTION 'Sin permiso para conciliar impuestos.' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    s.id,
    s.fecha,
    s.monto,
    s.descripcion,
    s.categoria,
    s.cuenta_contable,
    s.origen_id,
    s.contraparte,
    (
      COALESCE(s.categoria, '') ~* 'impuesto|iibb|iva|percep|retenc'
      OR COALESCE(s.cuenta_contable, '') ~* 'impuesto|iibb|iva|percep|retenc'
      OR COALESCE(s.descripcion, '') ~* 'impuesto|iibb|iva|percep|retenc'
    ) AS es_impuesto,
    EXISTS (
      SELECT 1 FROM public.imp_percepcion_mp p WHERE p.tesoreria_id = s.id
    ) AS usado_impuestos,
    NULLIF(btrim(COALESCE(s.raw->>'observaciones', '')), '') AS observaciones
  FROM public.cb_movimiento s
  WHERE s.canal = 'mercadopago'
    AND s.origen = 'sistema'
  ORDER BY s.fecha DESC, s.origen_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.imp_listar_tesoreria_mp() TO authenticated;
REVOKE EXECUTE ON FUNCTION public.imp_listar_tesoreria_mp() FROM PUBLIC;
