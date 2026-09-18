-- Impuestos: conciliación manual de percepciones no conciliadas
-- con un único movimiento de tesorería Mercado Pago.
-- No crea cb_match (el Nº de movimiento del reporte es el cargo/venta del extracto,
-- no el débito de la percepción).

ALTER TABLE public.imp_percepcion_mp
  ADD COLUMN IF NOT EXISTS tesoreria_id uuid REFERENCES public.cb_movimiento(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS tesoreria_grupo uuid,
  ADD COLUMN IF NOT EXISTS tesoreria_justificacion text,
  ADD COLUMN IF NOT EXISTS tesoreria_diferencia numeric(18,2),
  ADD COLUMN IF NOT EXISTS tesoreria_at timestamptz,
  ADD COLUMN IF NOT EXISTS tesoreria_by uuid;

CREATE INDEX IF NOT EXISTS idx_imp_percepcion_mp_tesoreria
  ON public.imp_percepcion_mp (tesoreria_id)
  WHERE tesoreria_id IS NOT NULL;

COMMENT ON COLUMN public.imp_percepcion_mp.tesoreria_id IS
  'Movimiento de tesorería MP (origen=sistema) al que se concilió esta percepción a mano.';

DROP FUNCTION IF EXISTS public.imp_listar_percepcion_mp(text);

CREATE OR REPLACE FUNCTION public.imp_listar_percepcion_mp(p_regimen text)
RETURNS TABLE (
  id uuid,
  regimen text,
  origen_id text,
  numero_cargo text,
  fecha date,
  factura_legal text,
  detalle text,
  operacion_relacionada text,
  importe_con_iva numeric,
  importe_sin_iva numeric,
  base_imponible numeric,
  alicuota numeric,
  monto_percibido numeric,
  archivo text,
  fila_excel integer,
  periodo_reporte text,
  en_extracto boolean,
  conciliado boolean,
  no_requiere boolean,
  extracto_tipo text,
  extracto_monto numeric,
  extracto_fecha date,
  tesoreria_id uuid,
  tesoreria_fecha date,
  tesoreria_monto numeric,
  tesoreria_descripcion text
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
  IF p_regimen IS NULL OR p_regimen NOT IN ('CIBBPP', 'CIBCPP', 'CIVAPP') THEN
    RAISE EXCEPTION 'Régimen de percepción inválido.';
  END IF;

  RETURN QUERY
  SELECT
    p.id,
    p.regimen,
    p.origen_id,
    p.numero_cargo,
    p.fecha,
    p.factura_legal,
    p.detalle,
    p.operacion_relacionada,
    p.importe_con_iva,
    p.importe_sin_iva,
    p.base_imponible,
    p.alicuota,
    p.monto_percibido,
    p.archivo,
    p.fila_excel,
    p.periodo_reporte,
    (b.id IS NOT NULL) AS en_extracto,
    CASE
      WHEN p.tesoreria_id IS NOT NULL THEN true
      WHEN b.id IS NULL THEN false
      WHEN COALESCE(b.no_requiere_conciliacion, false) THEN true
      ELSE EXISTS (
        SELECT 1
        FROM public.cb_match x
        WHERE x.canal = 'mercadopago'
          AND x.estado = 'confirmado'
          AND (
            x.banco_id = b.id
            OR b.id = ANY (COALESCE(x.banco_ids, ARRAY[]::uuid[]))
          )
      )
    END AS conciliado,
    COALESCE(b.no_requiere_conciliacion, false) AS no_requiere,
    b.tipo AS extracto_tipo,
    b.monto AS extracto_monto,
    b.fecha AS extracto_fecha,
    p.tesoreria_id,
    t.fecha AS tesoreria_fecha,
    t.monto AS tesoreria_monto,
    t.descripcion AS tesoreria_descripcion
  FROM public.imp_percepcion_mp p
  LEFT JOIN public.cb_movimiento b
    ON b.canal = 'mercadopago'
   AND b.origen = 'banco'
   AND (b.origen_id = p.origen_id OR COALESCE(b.id_movimiento_banco, '') = p.origen_id)
  LEFT JOIN public.cb_movimiento t
    ON t.id = p.tesoreria_id
  WHERE p.regimen = imp_listar_percepcion_mp.p_regimen
  ORDER BY p.fecha DESC, p.origen_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.imp_listar_percepcion_mp(text) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.imp_listar_percepcion_mp(text) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.imp_listar_tesoreria_mp()
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
  usado_impuestos boolean
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
    ) AS usado_impuestos
  FROM public.cb_movimiento s
  WHERE s.canal = 'mercadopago'
    AND s.origen = 'sistema'
  ORDER BY s.fecha DESC, s.origen_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.imp_listar_tesoreria_mp() TO authenticated;
REVOKE EXECUTE ON FUNCTION public.imp_listar_tesoreria_mp() FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.imp_conciliar_percepciones_mp(
  p_regimen text,
  p_ids uuid[],
  p_sistema_id uuid,
  p_justificacion text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ids uuid[];
  v_just text;
  v_n integer;
  v_sum numeric(18,4);
  v_tes numeric(18,2);
  v_diff numeric(18,2);
  v_grupo uuid;
  v_ok integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sesión vencida. Recargá la página e iniciá sesión.' USING ERRCODE = '42501';
  END IF;
  IF NOT public.has_permission('cargar_impuestos') THEN
    RAISE EXCEPTION 'Sin permiso para conciliar impuestos.' USING ERRCODE = '42501';
  END IF;
  IF p_regimen IS NULL OR p_regimen NOT IN ('CIBBPP', 'CIBCPP', 'CIVAPP') THEN
    RAISE EXCEPTION 'Régimen de percepción inválido.';
  END IF;
  IF p_sistema_id IS NULL THEN
    RAISE EXCEPTION 'Elegí un movimiento de tesorería Mercado Pago.';
  END IF;

  SELECT ARRAY(
    SELECT DISTINCT x FROM unnest(COALESCE(p_ids, ARRAY[]::uuid[])) AS x WHERE x IS NOT NULL
  ) INTO v_ids;
  IF COALESCE(cardinality(v_ids), 0) < 1 THEN
    RAISE EXCEPTION 'Elegí al menos una percepción no conciliada.';
  END IF;

  v_just := NULLIF(btrim(COALESCE(p_justificacion, '')), '');
  IF v_just IS NULL OR char_length(v_just) < 8 THEN
    RAISE EXCEPTION 'La justificación es obligatoria (mínimo 8 caracteres).';
  END IF;

  SELECT count(*) INTO v_ok
  FROM public.cb_movimiento s
  WHERE s.id = p_sistema_id
    AND s.canal = 'mercadopago'
    AND s.origen = 'sistema';
  IF v_ok <> 1 THEN
    RAISE EXCEPTION 'El movimiento de tesorería no existe o no es de Mercado Pago.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.imp_percepcion_mp p
    WHERE p.tesoreria_id = p_sistema_id
      AND NOT (p.id = ANY (v_ids))
  ) THEN
    RAISE EXCEPTION 'Ese movimiento de tesorería ya está usado en otra conciliación de Impuestos.';
  END IF;

  SELECT count(*), COALESCE(sum(p.monto_percibido), 0)
  INTO v_n, v_sum
  FROM public.imp_percepcion_mp p
  WHERE p.regimen = p_regimen
    AND p.id = ANY (v_ids)
    AND p.tesoreria_id IS NULL;
  IF v_n <> cardinality(v_ids) THEN
    RAISE EXCEPTION 'Alguna percepción no existe, es de otro régimen o ya está conciliada con tesorería.';
  END IF;

  SELECT ROUND(abs(s.monto), 2) INTO v_tes
  FROM public.cb_movimiento s
  WHERE s.id = p_sistema_id;

  v_diff := ROUND(v_sum - v_tes, 2);
  v_grupo := gen_random_uuid();

  UPDATE public.imp_percepcion_mp p
  SET tesoreria_id = p_sistema_id,
      tesoreria_grupo = v_grupo,
      tesoreria_justificacion = v_just,
      tesoreria_diferencia = v_diff,
      tesoreria_at = now(),
      tesoreria_by = auth.uid()
  WHERE p.id = ANY (v_ids);

  RETURN jsonb_build_object(
    'n', v_n,
    'grupo', v_grupo,
    'suma_percibido', v_sum,
    'tesoreria', v_tes,
    'diferencia', v_diff
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.imp_conciliar_percepciones_mp(text, uuid[], uuid, text) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.imp_conciliar_percepciones_mp(text, uuid[], uuid, text) FROM PUBLIC;

COMMENT ON FUNCTION public.imp_conciliar_percepciones_mp(text, uuid[], uuid, text) IS
  'Conciliación manual Impuestos: N percepciones de un régimen contra un único movimiento de tesorería MP. Justificación obligatoria. No toca cb_match.';
