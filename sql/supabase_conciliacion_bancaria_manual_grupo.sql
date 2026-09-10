-- Conciliación manual N:M: varios extractos vs una o más tesorerías.
-- Requiere sql/supabase_conciliacion_bancaria.sql y sql/supabase_conciliacion_bancaria_manual.sql.

ALTER TABLE public.cb_match
  ADD COLUMN IF NOT EXISTS banco_ids uuid[],
  ADD COLUMN IF NOT EXISTS sistema_ids uuid[];

COMMENT ON COLUMN public.cb_match.banco_ids IS
  'Todos los movimientos de extracto del grupo (manual N:M). Si es null, vale solo banco_id.';
COMMENT ON COLUMN public.cb_match.sistema_ids IS
  'Todos los movimientos de tesorería del grupo (manual N:M). Si es null, vale solo sistema_id.';

DROP INDEX IF EXISTS public.idx_cb_match_banco_activo;
DROP INDEX IF EXISTS public.idx_cb_match_sistema_activo;

CREATE OR REPLACE FUNCTION public.cb_match_ids_lado(p_match public.cb_match, p_lado text)
RETURNS uuid[]
LANGUAGE sql
STABLE
AS $$
  SELECT CASE
    WHEN p_lado = 'banco' THEN
      ARRAY(SELECT DISTINCT x FROM unnest(
        ARRAY[p_match.banco_id] || COALESCE(p_match.banco_ids, ARRAY[]::uuid[])
      ) AS x WHERE x IS NOT NULL)
    ELSE
      ARRAY(SELECT DISTINCT x FROM unnest(
        ARRAY[p_match.sistema_id] || COALESCE(p_match.sistema_ids, ARRAY[]::uuid[])
      ) AS x WHERE x IS NOT NULL)
  END;
$$;

CREATE OR REPLACE FUNCTION public.cb_match_sin_solapamiento()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ids uuid[];
BEGIN
  IF NEW.estado IS NULL OR NEW.estado NOT IN ('sugerido', 'confirmado') THEN
    RETURN NEW;
  END IF;
  v_ids := public.cb_match_ids_lado(NEW, 'banco') || public.cb_match_ids_lado(NEW, 'sistema');
  IF EXISTS (
    SELECT 1
    FROM public.cb_match m
    WHERE m.id <> NEW.id
      AND m.estado IN ('sugerido', 'confirmado')
      AND (
        public.cb_match_ids_lado(m, 'banco') && v_ids
        OR public.cb_match_ids_lado(m, 'sistema') && v_ids
      )
  ) THEN
    RAISE EXCEPTION 'Uno de los movimientos ya está en otra conciliación activa.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_cb_match_sin_solapamiento ON public.cb_match;
CREATE TRIGGER trg_cb_match_sin_solapamiento
  AFTER INSERT OR UPDATE OF estado, banco_id, sistema_id, banco_ids, sistema_ids
  ON public.cb_match
  FOR EACH ROW
  EXECUTE FUNCTION public.cb_match_sin_solapamiento();

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

  IF v_bancos IS NULL OR cardinality(v_bancos) < 1 OR v_sist IS NULL OR cardinality(v_sist) < 1 THEN
    RAISE EXCEPTION 'Elegí al menos un movimiento del extracto y uno de tesorería.';
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

  SELECT count(*) INTO v_n_s
  FROM public.cb_movimiento
  WHERE id = ANY(v_sist) AND canal = p_canal AND origen = 'sistema';
  IF v_n_s <> cardinality(v_sist) THEN
    RAISE EXCEPTION 'Algún movimiento de tesorería no existe o no es de este canal.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.cb_match m
    WHERE m.estado = 'confirmado'
      AND (
        public.cb_match_ids_lado(m, 'banco') && v_bancos
        OR public.cb_match_ids_lado(m, 'sistema') && v_bancos
        OR public.cb_match_ids_lado(m, 'banco') && v_sist
        OR public.cb_match_ids_lado(m, 'sistema') && v_sist
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
      public.cb_match_ids_lado(cb_match, 'banco') && (v_bancos || v_sist)
      OR public.cb_match_ids_lado(cb_match, 'sistema') && (v_bancos || v_sist)
    );

  INSERT INTO public.cb_match (
    canal, banco_id, sistema_id, banco_ids, sistema_ids,
    score, criterio, estado,
    justificacion, diferencia, origen_match,
    confirmado_at, confirmado_by
  ) VALUES (
    p_canal, v_bancos[1], v_sist[1], v_bancos, v_sist,
    0, 'manual', 'confirmado',
    v_just, v_diff, 'manual',
    now(), auth.uid()
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.cb_confirmar_manual(
  p_canal text,
  p_banco_id uuid,
  p_sistema_id uuid,
  p_justificacion text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN public.cb_confirmar_manual_grupo(
    p_canal,
    ARRAY[p_banco_id],
    ARRAY[p_sistema_id],
    p_justificacion
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.cb_confirmar_manual_grupo(text, uuid[], uuid[], text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cb_confirmar_manual(text, uuid, uuid, text) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.cb_confirmar_manual_grupo(text, uuid[], uuid[], text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.cb_confirmar_manual(text, uuid, uuid, text) FROM PUBLIC;

COMMENT ON FUNCTION public.cb_confirmar_manual_grupo(text, uuid[], uuid[], text) IS
  'Confirma conciliación manual N:M: uno o más extractos vs una o más tesorerías, con justificación. Diferencia = suma extracto − suma tesorería.';
