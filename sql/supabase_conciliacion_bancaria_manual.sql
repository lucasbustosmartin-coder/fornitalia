-- Fornitalia – Conciliación Bancaria: match manual con justificación de diferencia.
-- Amplía cb_match y agrega RPC cb_confirmar_manual.
-- Requiere sql/supabase_conciliacion_bancaria.sql ya aplicado.

ALTER TABLE public.cb_match
  ADD COLUMN IF NOT EXISTS justificacion text,
  ADD COLUMN IF NOT EXISTS diferencia numeric(18,2),
  ADD COLUMN IF NOT EXISTS origen_match text;

UPDATE public.cb_match
SET origen_match = CASE
  WHEN criterio = 'manual' THEN 'manual'
  ELSE 'auto'
END
WHERE origen_match IS NULL;

ALTER TABLE public.cb_match
  ALTER COLUMN origen_match SET DEFAULT 'auto';

UPDATE public.cb_match SET origen_match = 'auto' WHERE origen_match IS NULL;

ALTER TABLE public.cb_match
  ALTER COLUMN origen_match SET NOT NULL;

ALTER TABLE public.cb_match DROP CONSTRAINT IF EXISTS cb_match_origen_match_chk;
ALTER TABLE public.cb_match
  ADD CONSTRAINT cb_match_origen_match_chk CHECK (origen_match IN ('auto', 'manual'));

COMMENT ON COLUMN public.cb_match.justificacion IS
  'Motivo de la conciliación (obligatorio en matches manuales, p. ej. diferencia de importe).';
COMMENT ON COLUMN public.cb_match.diferencia IS
  'Importe extracto (banco) menos importe tesorería (sistema), al confirmar.';
COMMENT ON COLUMN public.cb_match.origen_match IS
  'auto = sugerido por la app; manual = pareja elegida por el usuario.';

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
DECLARE
  v_banco public.cb_movimiento%ROWTYPE;
  v_sistema public.cb_movimiento%ROWTYPE;
  v_just text;
  v_diff numeric(18,2);
  v_id uuid;
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
  IF p_banco_id IS NULL OR p_sistema_id IS NULL OR p_banco_id = p_sistema_id THEN
    RAISE EXCEPTION 'Elegí un movimiento del extracto y uno del sistema.';
  END IF;

  v_just := NULLIF(btrim(COALESCE(p_justificacion, '')), '');
  IF v_just IS NULL OR char_length(v_just) < 8 THEN
    RAISE EXCEPTION 'La justificación es obligatoria (mínimo 8 caracteres).';
  END IF;

  SELECT * INTO v_banco FROM public.cb_movimiento WHERE id = p_banco_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'El movimiento del extracto no existe.';
  END IF;
  SELECT * INTO v_sistema FROM public.cb_movimiento WHERE id = p_sistema_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'El movimiento del sistema no existe.';
  END IF;

  IF v_banco.canal <> p_canal OR v_sistema.canal <> p_canal THEN
    RAISE EXCEPTION 'Los movimientos no son de este canal.';
  END IF;
  IF v_banco.origen <> 'banco' THEN
    RAISE EXCEPTION 'El primer movimiento tiene que ser del extracto bancario.';
  END IF;
  IF v_sistema.origen <> 'sistema' THEN
    RAISE EXCEPTION 'El segundo movimiento tiene que ser de tesorería del sistema.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.cb_match m
    WHERE m.estado = 'confirmado'
      AND (m.banco_id = p_banco_id OR m.sistema_id = p_sistema_id)
  ) THEN
    RAISE EXCEPTION 'Uno de los movimientos ya está conciliado. Deshacé esa conciliación primero.';
  END IF;

  v_diff := ROUND(COALESCE(v_banco.monto, 0) - COALESCE(v_sistema.monto, 0), 2);

  DELETE FROM public.cb_match
  WHERE estado = 'sugerido'
    AND (banco_id = p_banco_id OR sistema_id = p_banco_id
         OR banco_id = p_sistema_id OR sistema_id = p_sistema_id);

  INSERT INTO public.cb_match (
    canal, banco_id, sistema_id, score, criterio, estado,
    justificacion, diferencia, origen_match,
    confirmado_at, confirmado_by
  ) VALUES (
    p_canal, p_banco_id, p_sistema_id, 0, 'manual', 'confirmado',
    v_just, v_diff, 'manual',
    now(), auth.uid()
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.cb_confirmar_manual(text, uuid, uuid, text) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.cb_confirmar_manual(text, uuid, uuid, text) FROM PUBLIC;

COMMENT ON FUNCTION public.cb_confirmar_manual(text, uuid, uuid, text) IS
  'Confirma una pareja extracto+tesorería elegida a mano, con justificación. Permite diferencia de importe > $1. Quita sugerencias que usen esos movimientos.';
