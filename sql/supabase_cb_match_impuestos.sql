-- Confirmados: tesorería de conciliación manual de Impuestos
-- (sin líneas de extracto: el Nº de movimiento del reporte es el cargo, no la retención).

ALTER TABLE public.cb_match
  ALTER COLUMN banco_id DROP NOT NULL;

COMMENT ON COLUMN public.cb_match.banco_id IS
  'Movimiento de extracto (o NULL si la conciliación es solo tesorería, p. ej. Impuestos).';

ALTER TABLE public.cb_match DROP CONSTRAINT IF EXISTS cb_match_tiene_lado;
ALTER TABLE public.cb_match
  ADD CONSTRAINT cb_match_tiene_lado CHECK (banco_id IS NOT NULL OR sistema_id IS NOT NULL);

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
  v_match uuid;
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

  IF EXISTS (
    SELECT 1 FROM public.cb_match m
    WHERE m.estado = 'confirmado'
      AND m.criterio IS DISTINCT FROM 'impuestos'
      AND (
        public.cb_match_ids_lado(m, 'sistema') && ARRAY[p_sistema_id]
        OR public.cb_match_ids_lado(m, 'banco') && ARRAY[p_sistema_id]
      )
  ) THEN
    RAISE EXCEPTION 'Ese movimiento de tesorería ya está en Confirmados de Conciliación Bancaria. Deshacé esa conciliación primero.';
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

  DELETE FROM public.cb_match
  WHERE estado = 'sugerido'
    AND (
      public.cb_match_ids_lado(cb_match, 'banco') && ARRAY[p_sistema_id]
      OR public.cb_match_ids_lado(cb_match, 'sistema') && ARRAY[p_sistema_id]
    );

  UPDATE public.imp_percepcion_mp p
  SET tesoreria_id = p_sistema_id,
      tesoreria_grupo = v_grupo,
      tesoreria_justificacion = v_just,
      tesoreria_diferencia = v_diff,
      tesoreria_at = now(),
      tesoreria_by = auth.uid()
  WHERE p.id = ANY (v_ids);

  INSERT INTO public.cb_match (
    canal, banco_id, sistema_id, banco_ids, sistema_ids,
    score, criterio, estado,
    justificacion, diferencia, origen_match,
    confirmado_at, confirmado_by
  ) VALUES (
    'mercadopago',
    NULL,
    p_sistema_id,
    NULL,
    ARRAY[p_sistema_id],
    0, 'impuestos', 'confirmado',
    v_just, v_diff, 'manual',
    now(), auth.uid()
  )
  RETURNING id INTO v_match;

  RETURN jsonb_build_object(
    'n', v_n,
    'grupo', v_grupo,
    'match_id', v_match,
    'suma_percibido', v_sum,
    'tesoreria', v_tes,
    'diferencia', v_diff
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.imp_conciliar_percepciones_mp(text, uuid[], uuid, text) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.imp_conciliar_percepciones_mp(text, uuid[], uuid, text) FROM PUBLIC;

COMMENT ON FUNCTION public.imp_conciliar_percepciones_mp(text, uuid[], uuid, text) IS
  'Conciliación manual Impuestos: N percepciones vs un tesorería MP. Crea un confirmado en cb_match (criterio impuestos, sin extracto).';

CREATE OR REPLACE FUNCTION public.cb_set_match_estado(p_match_id uuid, p_estado text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_criterio text;
  v_sistema uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sesión vencida. Recargá la página e iniciá sesión.' USING ERRCODE = '42501';
  END IF;
  IF NOT public.has_permission('confirmar_conciliacion_bancaria') THEN
    RAISE EXCEPTION 'Sin permiso para confirmar conciliación.' USING ERRCODE = '42501';
  END IF;
  IF p_estado NOT IN ('confirmado', 'rechazado', 'sugerido') THEN
    RAISE EXCEPTION 'Estado inválido.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.cb_match m WHERE m.id = p_match_id) THEN
    RAISE EXCEPTION 'El match no existe.';
  END IF;

  IF p_estado = 'sugerido' THEN
    IF NOT EXISTS (SELECT 1 FROM public.cb_match m WHERE m.id = p_match_id AND m.estado = 'confirmado') THEN
      RAISE EXCEPTION 'Solo se puede deshacer una conciliación confirmada.';
    END IF;
    SELECT m.criterio, m.sistema_id INTO v_criterio, v_sistema
    FROM public.cb_match m
    WHERE m.id = p_match_id;
    IF v_criterio = 'impuestos' THEN
      UPDATE public.imp_percepcion_mp
      SET tesoreria_id = NULL,
          tesoreria_grupo = NULL,
          tesoreria_justificacion = NULL,
          tesoreria_diferencia = NULL,
          tesoreria_at = NULL,
          tesoreria_by = NULL
      WHERE tesoreria_id = v_sistema;
      DELETE FROM public.cb_match WHERE id = p_match_id;
      RETURN;
    END IF;
  END IF;

  UPDATE public.cb_match
  SET estado = p_estado,
      confirmado_at = CASE
        WHEN p_estado = 'confirmado' THEN now()
        WHEN p_estado = 'sugerido' THEN NULL
        ELSE confirmado_at
      END,
      confirmado_by = CASE
        WHEN p_estado = 'confirmado' THEN auth.uid()
        WHEN p_estado = 'sugerido' THEN NULL
        ELSE confirmado_by
      END
  WHERE id = p_match_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.cb_set_match_estado(uuid, text) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.cb_set_match_estado(uuid, text) FROM PUBLIC;

-- Backfill de conciliaciones de Impuestos ya confirmadas.
DELETE FROM public.cb_match m
WHERE m.estado = 'sugerido'
  AND m.sistema_id IN (
    SELECT DISTINCT p.tesoreria_id FROM public.imp_percepcion_mp p WHERE p.tesoreria_id IS NOT NULL
  );

INSERT INTO public.cb_match (
  canal, banco_id, sistema_id, banco_ids, sistema_ids,
  score, criterio, estado,
  justificacion, diferencia, origen_match,
  confirmado_at, confirmado_by
)
SELECT
  'mercadopago',
  NULL,
  g.tesoreria_id,
  NULL,
  ARRAY[g.tesoreria_id],
  0,
  'impuestos',
  'confirmado',
  g.justif,
  g.dif,
  'manual',
  g.at,
  g.by_id
FROM (
  SELECT
    p.tesoreria_id,
    min(p.tesoreria_justificacion) AS justif,
    min(p.tesoreria_diferencia) AS dif,
    min(p.tesoreria_at) AS at,
    (array_agg(p.tesoreria_by ORDER BY p.tesoreria_at))[1] AS by_id
  FROM public.imp_percepcion_mp p
  WHERE p.tesoreria_id IS NOT NULL
  GROUP BY p.tesoreria_id
) g
WHERE NOT EXISTS (
  SELECT 1 FROM public.cb_match m
  WHERE m.estado IN ('sugerido', 'confirmado')
    AND (
      public.cb_match_ids_lado(m, 'sistema') && ARRAY[g.tesoreria_id]
      OR public.cb_match_ids_lado(m, 'banco') && ARRAY[g.tesoreria_id]
    )
);
