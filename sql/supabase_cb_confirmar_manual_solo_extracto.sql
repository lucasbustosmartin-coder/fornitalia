-- Conciliación manual: dos o más movimientos del mismo extracto, sin tesorería.
-- Caso típico: el cliente transfiere por error y la empresa lo devuelve;
-- crédito y débito quedan solo en el extracto.

ALTER TABLE public.cb_match
  ALTER COLUMN sistema_id DROP NOT NULL;

COMMENT ON COLUMN public.cb_match.sistema_id IS
  'Movimiento de tesorería (o NULL si la conciliación es solo entre extractos).';

CREATE OR REPLACE FUNCTION public.cb_confirmar_manual_grupo(
  p_canal text,
  p_banco_ids uuid[],
  p_sistema_ids uuid[],
  p_justificacion text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_bancos uuid[];
  v_sist uuid[];
  v_just text;
  v_diff numeric(18,2);
  v_id uuid;
  v_n_b integer;
  v_n_s integer;
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
    SELECT s.x FROM (
      SELECT DISTINCT ON (t.x) t.x, t.ord
      FROM unnest(COALESCE(p_banco_ids, ARRAY[]::uuid[])) WITH ORDINALITY AS t(x, ord)
      WHERE t.x IS NOT NULL
      ORDER BY t.x, t.ord
    ) s
    ORDER BY s.ord
  ) INTO v_bancos;
  SELECT ARRAY(
    SELECT s.x FROM (
      SELECT DISTINCT ON (t.x) t.x, t.ord
      FROM unnest(COALESCE(p_sistema_ids, ARRAY[]::uuid[])) WITH ORDINALITY AS t(x, ord)
      WHERE t.x IS NOT NULL
      ORDER BY t.x, t.ord
    ) s
    ORDER BY s.ord
  ) INTO v_sist;

  v_n_b := COALESCE(cardinality(v_bancos), 0);
  v_n_s := COALESCE(cardinality(v_sist), 0);

  IF v_n_b < 1 THEN
    RAISE EXCEPTION 'Elegí al menos un movimiento del extracto.';
  END IF;
  IF v_n_s < 1 AND v_n_b < 2 THEN
    RAISE EXCEPTION 'Sin tesorería, elegí al menos dos movimientos del extracto (crédito y débito). O elegí también un movimiento de tesorería.';
  END IF;

  v_just := NULLIF(btrim(COALESCE(p_justificacion, '')), '');
  IF v_just IS NULL OR char_length(v_just) < 8 THEN
    RAISE EXCEPTION 'La justificación es obligatoria (mínimo 8 caracteres).';
  END IF;

  SELECT count(*) INTO v_n_b
  FROM public.cb_movimiento
  WHERE id = ANY(v_bancos) AND canal = p_canal AND origen = 'banco';
  IF v_n_b <> cardinality(v_bancos) THEN
    RAISE EXCEPTION 'Algún movimiento del extracto no existe o no es de este canal.';
  END IF;

  IF v_n_s > 0 THEN
    SELECT count(*) INTO v_n_s
    FROM public.cb_movimiento
    WHERE id = ANY(v_sist) AND canal = p_canal AND origen = 'sistema';
    IF v_n_s <> cardinality(v_sist) THEN
      RAISE EXCEPTION 'Algún movimiento de tesorería no existe o no es de este canal.';
    END IF;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.cb_match m
    WHERE m.estado = 'confirmado'
      AND (
        public.cb_match_ids_lado(m, 'banco') && v_bancos
        OR public.cb_match_ids_lado(m, 'sistema') && v_bancos
        OR (v_n_s > 0 AND public.cb_match_ids_lado(m, 'banco') && v_sist)
        OR (v_n_s > 0 AND public.cb_match_ids_lado(m, 'sistema') && v_sist)
      )
  ) THEN
    RAISE EXCEPTION 'Uno de los movimientos ya está conciliado. Deshacé esa conciliación primero.';
  END IF;

  SELECT ROUND(
    COALESCE((SELECT sum(monto) FROM public.cb_movimiento WHERE id = ANY(v_bancos)), 0)
    - COALESCE((SELECT sum(monto) FROM public.cb_movimiento WHERE id = ANY(v_sist)), 0)
  , 2) INTO v_diff;

  DELETE FROM public.cb_match
  WHERE estado = 'sugerido'
    AND (
      public.cb_match_ids_lado(cb_match, 'banco') && (v_bancos || COALESCE(v_sist, ARRAY[]::uuid[]))
      OR public.cb_match_ids_lado(cb_match, 'sistema') && (v_bancos || COALESCE(v_sist, ARRAY[]::uuid[]))
    );

  INSERT INTO public.cb_match (
    canal, banco_id, sistema_id, banco_ids, sistema_ids,
    score, criterio, estado,
    justificacion, diferencia, origen_match,
    confirmado_at, confirmado_by
  ) VALUES (
    p_canal,
    v_bancos[1],
    CASE WHEN cardinality(v_sist) >= 1 THEN v_sist[1] ELSE NULL END,
    v_bancos,
    CASE WHEN cardinality(v_sist) >= 1 THEN v_sist ELSE NULL END,
    0, 'manual', 'confirmado',
    v_just, v_diff, 'manual',
    now(), auth.uid()
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

COMMENT ON FUNCTION public.cb_confirmar_manual_grupo(text, uuid[], uuid[], text) IS
  'Confirma conciliación manual N:M: extractos vs tesorerías, o dos o más extractos entre sí (crédito/débito sin contrapartida en tesorería). Justificación obligatoria. Diferencia = suma extracto − suma tesorería (0 si no hay tesorería).';
