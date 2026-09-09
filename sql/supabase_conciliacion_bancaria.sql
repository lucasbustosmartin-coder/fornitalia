-- Fornitalia – Conciliación Bancaria (Mercado Pago ahora; Galicia después).
-- Dos orígenes por canal: extracto del banco y tesorería del sistema.
-- Upsert por (canal, origen, origen_id) para no duplicar (MP: Número de Movimiento).
-- Requiere public.fecha_hoy_argentina() y el módulo de seguridad (has_permission).

-- ========== 0. Helper updated_at ==========

CREATE OR REPLACE FUNCTION public.cb_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  -- cb_match no tiene created_by; no tocarlo (si no, el INSERT de sugerencias falla).
  IF TG_OP = 'INSERT' AND TG_TABLE_NAME = 'cb_movimiento' THEN
    IF NEW.created_by IS NULL THEN
      NEW.created_by = auth.uid();
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- ========== 1. Permisos ==========

INSERT INTO public.app_permission (permission, description) VALUES
  ('ver_conciliacion_bancaria', 'Ver menú Conciliación Bancaria'),
  ('cargar_conciliacion_bancaria', 'Cargar Excel de extracto bancario y tesorería del sistema'),
  ('confirmar_conciliacion_bancaria', 'Confirmar o descartar matches de conciliación')
ON CONFLICT (permission) DO UPDATE SET description = EXCLUDED.description;

INSERT INTO public.app_role_permission (role, permission)
SELECT r.role, p.permission
FROM (VALUES ('admin'), ('encargado')) AS r(role)
CROSS JOIN (
  VALUES
    ('ver_conciliacion_bancaria'),
    ('cargar_conciliacion_bancaria'),
    ('confirmar_conciliacion_bancaria')
) AS p(permission)
ON CONFLICT (role, permission) DO NOTHING;

-- ========== 2. Tablas ==========

CREATE TABLE IF NOT EXISTS public.cb_movimiento (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  canal text NOT NULL CHECK (canal IN ('mercadopago', 'galicia')),
  origen text NOT NULL CHECK (origen IN ('banco', 'sistema')),
  origen_id text NOT NULL,
  fecha date NOT NULL DEFAULT public.fecha_hoy_argentina(),
  fecha_hora timestamptz,
  tipo text,
  descripcion text,
  contraparte text,
  monto numeric(18,2) NOT NULL,
  moneda text NOT NULL DEFAULT 'ARS',
  categoria text,
  cuenta_contable text,
  credito numeric(18,2),
  debito numeric(18,2),
  saldo numeric(18,2),
  id_operacion_relacionada text,
  id_movimiento_banco text,
  archivo text,
  fila_excel integer,
  raw jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  CONSTRAINT cb_movimiento_unica UNIQUE (canal, origen, origen_id)
);

CREATE INDEX IF NOT EXISTS idx_cb_movimiento_canal_origen ON public.cb_movimiento (canal, origen, fecha);
CREATE INDEX IF NOT EXISTS idx_cb_movimiento_monto ON public.cb_movimiento (canal, origen, monto);

CREATE TABLE IF NOT EXISTS public.cb_match (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  canal text NOT NULL CHECK (canal IN ('mercadopago', 'galicia')),
  banco_id uuid NOT NULL REFERENCES public.cb_movimiento(id) ON DELETE CASCADE,
  sistema_id uuid NOT NULL REFERENCES public.cb_movimiento(id) ON DELETE CASCADE,
  score numeric(5,2),
  criterio text,
  estado text NOT NULL DEFAULT 'sugerido' CHECK (estado IN ('sugerido', 'confirmado', 'rechazado')),
  confirmado_at timestamptz,
  confirmado_by uuid,
  justificacion text,
  diferencia numeric(18,2),
  origen_match text NOT NULL DEFAULT 'auto' CHECK (origen_match IN ('auto', 'manual')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT cb_match_banco_sistema CHECK (banco_id <> sistema_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_cb_match_banco_activo
  ON public.cb_match (banco_id) WHERE estado IN ('sugerido', 'confirmado');
CREATE UNIQUE INDEX IF NOT EXISTS idx_cb_match_sistema_activo
  ON public.cb_match (sistema_id) WHERE estado IN ('sugerido', 'confirmado');
CREATE INDEX IF NOT EXISTS idx_cb_match_canal_estado ON public.cb_match (canal, estado);

ALTER TABLE public.cb_match ADD COLUMN IF NOT EXISTS justificacion text;
ALTER TABLE public.cb_match ADD COLUMN IF NOT EXISTS diferencia numeric(18,2);
ALTER TABLE public.cb_match ADD COLUMN IF NOT EXISTS origen_match text;
UPDATE public.cb_match SET origen_match = COALESCE(origen_match, 'auto') WHERE origen_match IS NULL;
ALTER TABLE public.cb_match ALTER COLUMN origen_match SET DEFAULT 'auto';
UPDATE public.cb_match SET origen_match = 'auto' WHERE origen_match IS NULL;
ALTER TABLE public.cb_match ALTER COLUMN origen_match SET NOT NULL;
ALTER TABLE public.cb_match DROP CONSTRAINT IF EXISTS cb_match_origen_match_chk;
ALTER TABLE public.cb_match ADD CONSTRAINT cb_match_origen_match_chk CHECK (origen_match IN ('auto', 'manual'));

DROP TRIGGER IF EXISTS trg_cb_movimiento_updated ON public.cb_movimiento;
CREATE TRIGGER trg_cb_movimiento_updated
  BEFORE INSERT OR UPDATE ON public.cb_movimiento
  FOR EACH ROW EXECUTE FUNCTION public.cb_set_updated_at();

DROP TRIGGER IF EXISTS trg_cb_match_updated ON public.cb_match;
CREATE TRIGGER trg_cb_match_updated
  BEFORE INSERT OR UPDATE ON public.cb_match
  FOR EACH ROW EXECUTE FUNCTION public.cb_set_updated_at();

ALTER TABLE public.cb_movimiento ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cb_match ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.cb_movimiento FROM anon;
REVOKE ALL ON TABLE public.cb_match FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.cb_movimiento TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.cb_match TO authenticated;

DROP POLICY IF EXISTS cb_movimiento_select ON public.cb_movimiento;
CREATE POLICY cb_movimiento_select ON public.cb_movimiento FOR SELECT TO authenticated
  USING (public.has_permission('ver_conciliacion_bancaria'));

DROP POLICY IF EXISTS cb_movimiento_insert ON public.cb_movimiento;
CREATE POLICY cb_movimiento_insert ON public.cb_movimiento FOR INSERT TO authenticated
  WITH CHECK (public.has_permission('cargar_conciliacion_bancaria'));

DROP POLICY IF EXISTS cb_movimiento_update ON public.cb_movimiento;
CREATE POLICY cb_movimiento_update ON public.cb_movimiento FOR UPDATE TO authenticated
  USING (public.has_permission('cargar_conciliacion_bancaria'))
  WITH CHECK (public.has_permission('cargar_conciliacion_bancaria'));

DROP POLICY IF EXISTS cb_movimiento_delete ON public.cb_movimiento;
CREATE POLICY cb_movimiento_delete ON public.cb_movimiento FOR DELETE TO authenticated
  USING (public.has_permission('cargar_conciliacion_bancaria'));

DROP POLICY IF EXISTS cb_match_select ON public.cb_match;
CREATE POLICY cb_match_select ON public.cb_match FOR SELECT TO authenticated
  USING (public.has_permission('ver_conciliacion_bancaria'));

DROP POLICY IF EXISTS cb_match_insert ON public.cb_match;
CREATE POLICY cb_match_insert ON public.cb_match FOR INSERT TO authenticated
  WITH CHECK (
    public.has_permission('cargar_conciliacion_bancaria')
    OR public.has_permission('confirmar_conciliacion_bancaria')
  );

DROP POLICY IF EXISTS cb_match_update ON public.cb_match;
CREATE POLICY cb_match_update ON public.cb_match FOR UPDATE TO authenticated
  USING (
    public.has_permission('cargar_conciliacion_bancaria')
    OR public.has_permission('confirmar_conciliacion_bancaria')
  )
  WITH CHECK (
    public.has_permission('cargar_conciliacion_bancaria')
    OR public.has_permission('confirmar_conciliacion_bancaria')
  );

DROP POLICY IF EXISTS cb_match_delete ON public.cb_match;
CREATE POLICY cb_match_delete ON public.cb_match FOR DELETE TO authenticated
  USING (
    public.has_permission('cargar_conciliacion_bancaria')
    OR public.has_permission('confirmar_conciliacion_bancaria')
  );

-- ========== 3. RPCs ==========

CREATE OR REPLACE FUNCTION public.cb_guardar_movimientos(p_canal text, p_origen text, p_filas jsonb)
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
  IF NOT public.has_permission('cargar_conciliacion_bancaria') THEN
    RAISE EXCEPTION 'Sin permiso para cargar conciliación bancaria.' USING ERRCODE = '42501';
  END IF;
  IF p_canal IS NULL OR p_canal NOT IN ('mercadopago', 'galicia') THEN
    RAISE EXCEPTION 'Canal inválido.';
  END IF;
  IF p_origen IS NULL OR p_origen NOT IN ('banco', 'sistema') THEN
    RAISE EXCEPTION 'Origen inválido.';
  END IF;

  INSERT INTO public.cb_movimiento (
    canal, origen, origen_id, fecha, fecha_hora, tipo, descripcion, contraparte, monto, moneda,
    categoria, cuenta_contable, credito, debito, saldo,
    id_operacion_relacionada, id_movimiento_banco, archivo, fila_excel, raw, created_by
  )
  SELECT p_canal,
         p_origen,
         NULLIF(btrim(x->>'origen_id'), ''),
         COALESCE(NULLIF(btrim(x->>'fecha'), '')::date, public.fecha_hoy_argentina()),
         NULLIF(btrim(x->>'fecha_hora'), '')::timestamptz,
         NULLIF(btrim(x->>'tipo'), ''),
         NULLIF(btrim(x->>'descripcion'), ''),
         NULLIF(btrim(x->>'contraparte'), ''),
         ROUND(COALESCE((x->>'monto')::numeric, 0), 2),
         COALESCE(NULLIF(btrim(x->>'moneda'), ''), 'ARS'),
         NULLIF(btrim(x->>'categoria'), ''),
         NULLIF(btrim(x->>'cuenta_contable'), ''),
         CASE WHEN x->>'credito' IS NULL OR btrim(x->>'credito') = '' THEN NULL ELSE ROUND((x->>'credito')::numeric, 2) END,
         CASE WHEN x->>'debito' IS NULL OR btrim(x->>'debito') = '' THEN NULL ELSE ROUND((x->>'debito')::numeric, 2) END,
         CASE WHEN x->>'saldo' IS NULL OR btrim(x->>'saldo') = '' THEN NULL ELSE ROUND((x->>'saldo')::numeric, 2) END,
         NULLIF(btrim(x->>'id_operacion_relacionada'), ''),
         NULLIF(btrim(x->>'id_movimiento_banco'), ''),
         NULLIF(btrim(x->>'archivo'), ''),
         CASE WHEN x->>'fila_excel' IS NULL OR btrim(x->>'fila_excel') = '' THEN NULL ELSE (x->>'fila_excel')::integer END,
         CASE WHEN x->'raw' IS NULL OR jsonb_typeof(x->'raw') = 'null' THEN NULL ELSE x->'raw' END,
         auth.uid()
  FROM jsonb_array_elements(COALESCE(p_filas, '[]'::jsonb)) AS x
  WHERE NULLIF(btrim(x->>'origen_id'), '') IS NOT NULL
  ON CONFLICT (canal, origen, origen_id) DO UPDATE SET
    fecha = EXCLUDED.fecha,
    fecha_hora = EXCLUDED.fecha_hora,
    tipo = EXCLUDED.tipo,
    descripcion = EXCLUDED.descripcion,
    contraparte = EXCLUDED.contraparte,
    monto = EXCLUDED.monto,
    moneda = EXCLUDED.moneda,
    categoria = EXCLUDED.categoria,
    cuenta_contable = EXCLUDED.cuenta_contable,
    credito = EXCLUDED.credito,
    debito = EXCLUDED.debito,
    saldo = EXCLUDED.saldo,
    id_operacion_relacionada = EXCLUDED.id_operacion_relacionada,
    id_movimiento_banco = EXCLUDED.id_movimiento_banco,
    archivo = EXCLUDED.archivo,
    fila_excel = EXCLUDED.fila_excel,
    raw = EXCLUDED.raw;

  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;

CREATE OR REPLACE FUNCTION public.cb_reemplazar_sugerencias(p_canal text, p_filas jsonb)
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
  IF NOT (
    public.has_permission('cargar_conciliacion_bancaria')
    OR public.has_permission('confirmar_conciliacion_bancaria')
  ) THEN
    RAISE EXCEPTION 'Sin permiso para generar sugerencias de conciliación.' USING ERRCODE = '42501';
  END IF;
  IF p_canal IS NULL OR p_canal NOT IN ('mercadopago', 'galicia') THEN
    RAISE EXCEPTION 'Canal inválido.';
  END IF;

  DELETE FROM public.cb_match
  WHERE canal = p_canal AND estado = 'sugerido';

  INSERT INTO public.cb_match (canal, banco_id, sistema_id, score, criterio, estado)
  SELECT p_canal,
         (x->>'banco_id')::uuid,
         (x->>'sistema_id')::uuid,
         ROUND(COALESCE((x->>'score')::numeric, 0), 2),
         NULLIF(btrim(x->>'criterio'), ''),
         'sugerido'
  FROM jsonb_array_elements(COALESCE(p_filas, '[]'::jsonb)) AS x
  WHERE NULLIF(btrim(x->>'banco_id'), '') IS NOT NULL
    AND NULLIF(btrim(x->>'sistema_id'), '') IS NOT NULL;

  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;

CREATE OR REPLACE FUNCTION public.cb_set_match_estado(p_match_id uuid, p_estado text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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

GRANT EXECUTE ON FUNCTION public.cb_guardar_movimientos(text, text, jsonb) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.cb_guardar_movimientos(text, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cb_reemplazar_sugerencias(text, jsonb) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.cb_reemplazar_sugerencias(text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cb_set_match_estado(uuid, text) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.cb_set_match_estado(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cb_confirmar_manual(text, uuid, uuid, text) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.cb_confirmar_manual(text, uuid, uuid, text) FROM PUBLIC;

COMMENT ON TABLE public.cb_movimiento IS
  'Movimientos de conciliación: extracto banco (origen=banco) o tesorería sistema (origen=sistema). origen_id único por canal evita duplicados (MP: Número de Movimiento).';
COMMENT ON TABLE public.cb_match IS
  'Parejas sugeridas o confirmadas entre un movimiento de banco y uno de tesorería, por canal. origen_match=manual guarda justificación y diferencia de importe.';
COMMENT ON FUNCTION public.cb_guardar_movimientos(text, text, jsonb) IS
  'Upsert incremental de movimientos. Nunca borra filas previas: si (canal, origen, origen_id) ya existe, actualiza datos; si no, inserta. SECURITY DEFINER para created_by.';
COMMENT ON FUNCTION public.cb_reemplazar_sugerencias(text, jsonb) IS
  'Borra sugeridos del canal y carga las nuevas parejas propuestas. No toca confirmados ni rechazados.';
COMMENT ON FUNCTION public.cb_set_match_estado(uuid, text) IS
  'Confirma, descarta o deshace (confirmado → sugerido) un match.';
COMMENT ON FUNCTION public.cb_confirmar_manual(text, uuid, uuid, text) IS
  'Confirma una pareja extracto+tesorería elegida a mano, con justificación. Permite diferencia de importe > $1.';
