-- Histórico de tesorería: Id pendiente (o sin Status) que corta la secuencia
-- del archivo cargado. Si los Id van de 1 a 10 y falta el 8, el 8 entra
-- cuando ese movimiento sigue en la base como caja abierta.
-- Cajas de banco (incluye FCI): quedan en A eliminar de su caja.
-- Cajas físicas: también quedan en A eliminar, y el resultado de la carga
-- las lista por caja para confirmar la baja.
-- Confirmado no entra. Un Id que sí viene en el archivo no entra.

CREATE OR REPLACE FUNCTION public.historico_huecos_secuencia(p_origen_ids text[])
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lo bigint;
  v_hi bigint;
  v_presentes bigint[];
  v_puede_cb boolean;
  v_puede_cf boolean;
  v_bancos jsonb := '[]'::jsonb;
  v_fisicas jsonb := '[]'::jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sesión vencida. Recargá la página e iniciá sesión.' USING ERRCODE = '42501';
  END IF;

  v_puede_cb := public.has_permission('cargar_conciliacion_bancaria');
  v_puede_cf := public.has_permission('cargar_cajas_fisicas');
  IF NOT v_puede_cb AND NOT v_puede_cf THEN
    RAISE EXCEPTION 'Sin permiso para cargar tesorería.' USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(array_agg(DISTINCT n), ARRAY[]::bigint[])
  INTO v_presentes
  FROM (
    SELECT (
      CASE
        WHEN btrim(x) ~ '^id\|[0-9]{1,18}$' THEN substring(btrim(x) from 4)
        WHEN btrim(x) ~ '^[0-9]{1,18}$' THEN btrim(x)
        ELSE NULL
      END
    )::bigint AS n
    FROM unnest(COALESCE(p_origen_ids, ARRAY[]::text[])) AS x
  ) s
  WHERE n IS NOT NULL;

  SELECT min(x), max(x) INTO v_lo, v_hi FROM unnest(v_presentes) AS x;

  IF v_lo IS NULL OR v_hi IS NULL OR v_lo >= v_hi THEN
    RETURN jsonb_build_object(
      'id_min', v_lo,
      'id_max', v_hi,
      'bancos', '[]'::jsonb,
      'fisicas', '[]'::jsonb
    );
  END IF;

  IF v_puede_cb THEN
    UPDATE public.cb_movimiento m
    SET pendiente_baja = true
    WHERE public.cb_es_tesoreria_abierta(m)
      AND m.origen_id ~ '^id\|[0-9]{1,18}$'
      AND substring(m.origen_id from 4)::bigint BETWEEN v_lo AND v_hi
      AND NOT (substring(m.origen_id from 4)::bigint = ANY (v_presentes));

    SELECT COALESCE(jsonb_agg(jsonb_build_object('canal', s.canal, 'n', s.n) ORDER BY s.canal), '[]'::jsonb)
    INTO v_bancos
    FROM (
      SELECT m.canal, count(*)::int AS n
      FROM public.cb_movimiento m
      WHERE public.cb_es_tesoreria_abierta(m)
        AND m.origen_id ~ '^id\|[0-9]{1,18}$'
        AND substring(m.origen_id from 4)::bigint BETWEEN v_lo AND v_hi
        AND NOT (substring(m.origen_id from 4)::bigint = ANY (v_presentes))
      GROUP BY m.canal
    ) s;
  END IF;

  IF v_puede_cf THEN
    UPDATE public.cf_movimiento m
    SET pendiente_baja = true
    WHERE public.cf_es_tesoreria_abierta(m)
      AND m.origen_id ~ '^id\|[0-9]{1,18}$'
      AND substring(m.origen_id from 4)::bigint BETWEEN v_lo AND v_hi
      AND NOT (substring(m.origen_id from 4)::bigint = ANY (v_presentes));

    SELECT COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'id', m.id,
          'canal', m.canal,
          'origen_id', m.origen_id,
          'fecha', m.fecha,
          'tipo', COALESCE(m.tipo, ''),
          'descripcion', COALESCE(m.descripcion, ''),
          'monto', m.monto,
          'moneda', COALESCE(m.moneda, 'ARS')
        )
        ORDER BY m.canal, m.fecha, m.origen_id
      ),
      '[]'::jsonb
    )
    INTO v_fisicas
    FROM public.cf_movimiento m
    WHERE public.cf_es_tesoreria_abierta(m)
      AND m.origen_id ~ '^id\|[0-9]{1,18}$'
      AND substring(m.origen_id from 4)::bigint BETWEEN v_lo AND v_hi
      AND NOT (substring(m.origen_id from 4)::bigint = ANY (v_presentes));
  END IF;

  RETURN jsonb_build_object(
    'id_min', v_lo,
    'id_max', v_hi,
    'bancos', COALESCE(v_bancos, '[]'::jsonb),
    'fisicas', COALESCE(v_fisicas, '[]'::jsonb)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.cf_eliminar_tesoreria_abierta_lote(p_ids uuid[])
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

  DELETE FROM public.cf_movimiento m
  WHERE m.id = ANY (COALESCE(p_ids, ARRAY[]::uuid[]))
    AND public.cf_es_tesoreria_abierta(m);

  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;

GRANT EXECUTE ON FUNCTION public.historico_huecos_secuencia(text[]) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.historico_huecos_secuencia(text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cf_eliminar_tesoreria_abierta_lote(uuid[]) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.cf_eliminar_tesoreria_abierta_lote(uuid[]) FROM PUBLIC;

COMMENT ON FUNCTION public.historico_huecos_secuencia(text[]) IS
  'Pendiente o sin Status cuyo Id cae entre el menor y el mayor del histórico y no viene en el archivo. Las cajas de banco quedan en A eliminar; las físicas también, para confirmar la baja.';
COMMENT ON FUNCTION public.cf_eliminar_tesoreria_abierta_lote(uuid[]) IS
  'Baja definitiva de movimientos de caja física que siguen abiertos (Pendiente o sin Status).';
