-- Fornitalia – Cajas (físicas): Galicia-f (ARS) (efectivo pesos) y Morba-s/f (ARS) (Transferencia Morba).
-- Misma lógica de tesorería/cierre que Conciliación Bancaria, sin extracto ni match.
-- El saldo de cierre alimenta Saldos extractos (canales galicia_facturada y morba_sf).
-- Requiere public.fecha_hoy_argentina() y has_permission.

-- ========== 1. Permisos ==========

INSERT INTO public.app_permission (permission, description) VALUES
  ('ver_cajas_fisicas', 'Ver menú Cajas (físicas)'),
  ('cargar_cajas_fisicas', 'Cargar Excel de tesorería abierta o cierre de caja física'),
  ('exportar_cajas_fisicas', 'Exportar movimientos de cajas físicas a Excel')
ON CONFLICT (permission) DO UPDATE SET description = EXCLUDED.description;

INSERT INTO public.app_role_permission (role, permission)
SELECT r.role, p.permission
FROM (VALUES ('admin'), ('encargado')) AS r(role)
CROSS JOIN (
  VALUES
    ('ver_cajas_fisicas'),
    ('cargar_cajas_fisicas'),
    ('exportar_cajas_fisicas')
) AS p(permission)
ON CONFLICT (role, permission) DO NOTHING;

-- ========== 2. Tabla movimientos ==========

CREATE TABLE IF NOT EXISTS public.cf_movimiento (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  canal text NOT NULL CHECK (canal IN ('galicia_facturada', 'morba_sf')),
  origen_id text NOT NULL,
  fecha date NOT NULL DEFAULT public.fecha_hoy_argentina(),
  fecha_hora timestamptz,
  tipo text,
  descripcion text,
  contraparte text,
  monto numeric(18,2) NOT NULL DEFAULT 0,
  moneda text NOT NULL DEFAULT 'ARS',
  categoria text,
  cuenta_contable text,
  credito numeric(18,2),
  debito numeric(18,2),
  saldo numeric(18,2),
  archivo text,
  fila_excel integer,
  pendiente_baja boolean NOT NULL DEFAULT false,
  raw jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  CONSTRAINT cf_movimiento_unica UNIQUE (canal, origen_id)
);

CREATE INDEX IF NOT EXISTS idx_cf_movimiento_canal_fecha
  ON public.cf_movimiento (canal, fecha);
CREATE INDEX IF NOT EXISTS idx_cf_movimiento_pendiente_baja
  ON public.cf_movimiento (canal)
  WHERE pendiente_baja;

COMMENT ON TABLE public.cf_movimiento IS
  'Movimientos de cajas físicas (no conciliables). Galicia-f (ARS) = efectivo pesos; Morba-s/f (ARS) = Transferencia Morba (tesoreria_transferencia_morba / cierre_MOR).';

CREATE OR REPLACE FUNCTION public.cf_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  IF TG_OP = 'INSERT' AND NEW.created_by IS NULL THEN
    NEW.created_by = auth.uid();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_cf_movimiento_updated ON public.cf_movimiento;
CREATE TRIGGER trg_cf_movimiento_updated
  BEFORE INSERT OR UPDATE ON public.cf_movimiento
  FOR EACH ROW EXECUTE FUNCTION public.cf_set_updated_at();

ALTER TABLE public.cf_movimiento ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.cf_movimiento FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.cf_movimiento TO authenticated;

DROP POLICY IF EXISTS cf_movimiento_select ON public.cf_movimiento;
CREATE POLICY cf_movimiento_select ON public.cf_movimiento FOR SELECT TO authenticated
  USING (public.has_permission('ver_cajas_fisicas'));

DROP POLICY IF EXISTS cf_movimiento_insert ON public.cf_movimiento;
CREATE POLICY cf_movimiento_insert ON public.cf_movimiento FOR INSERT TO authenticated
  WITH CHECK (public.has_permission('cargar_cajas_fisicas'));

DROP POLICY IF EXISTS cf_movimiento_update ON public.cf_movimiento;
CREATE POLICY cf_movimiento_update ON public.cf_movimiento FOR UPDATE TO authenticated
  USING (public.has_permission('cargar_cajas_fisicas'))
  WITH CHECK (public.has_permission('cargar_cajas_fisicas'));

DROP POLICY IF EXISTS cf_movimiento_delete ON public.cf_movimiento;
CREATE POLICY cf_movimiento_delete ON public.cf_movimiento FOR DELETE TO authenticated
  USING (public.has_permission('cargar_cajas_fisicas'));

-- ========== 3. Saldos extractos: canal Galicia-f (ARS) ==========

ALTER TABLE public.eb_saldo_extracto DROP CONSTRAINT IF EXISTS eb_saldo_extracto_canal_check;
ALTER TABLE public.eb_saldo_extracto
  ADD CONSTRAINT eb_saldo_extracto_canal_check
  CHECK (canal IN ('galicia', 'mercadopago', 'galicia_facturada', 'morba_sf'));

COMMENT ON TABLE public.eb_saldo_extracto IS
  'Un renglón por corte de saldo. Galicia PDF, Mercado Pago Carta de saldo, Galicia-f (ARS) y Morba-s/f (ARS) (cajas físicas). Upsert por canal+cuenta+fecha_hasta.';

CREATE OR REPLACE FUNCTION public.eb_guardar_saldos(p_filas jsonb)
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
  IF NOT public.has_permission('cargar_saldos_extractos') THEN
    RAISE EXCEPTION 'Sin permiso para cargar saldos de extractos.' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.eb_saldo_extracto (
    canal, moneda, nro_cuenta, cbu, tipo_cuenta,
    fecha_desde, fecha_hasta, saldo_inicial, saldo_final,
    documento_id, archivo, raw, created_by
  )
  SELECT COALESCE(NULLIF(btrim(x->>'canal'), ''), 'galicia'),
         COALESCE(NULLIF(btrim(x->>'moneda'), ''), 'ARS'),
         COALESCE(NULLIF(btrim(x->>'nro_cuenta'), ''), ''),
         NULLIF(btrim(x->>'cbu'), ''),
         NULLIF(btrim(x->>'tipo_cuenta'), ''),
         COALESCE(NULLIF(btrim(x->>'fecha_desde'), '')::date, public.fecha_hoy_argentina()),
         COALESCE(NULLIF(btrim(x->>'fecha_hasta'), '')::date, public.fecha_hoy_argentina()),
         CASE WHEN x->>'saldo_inicial' IS NULL OR btrim(x->>'saldo_inicial') = '' THEN NULL
              ELSE ROUND((x->>'saldo_inicial')::numeric, 2) END,
         ROUND(COALESCE((x->>'saldo_final')::numeric, 0), 2),
         NULLIF(btrim(x->>'documento_id'), ''),
         NULLIF(btrim(x->>'archivo'), ''),
         CASE WHEN x->'raw' IS NULL OR jsonb_typeof(x->'raw') = 'null' THEN NULL ELSE x->'raw' END,
         auth.uid()
  FROM jsonb_array_elements(COALESCE(p_filas, '[]'::jsonb)) AS x
  WHERE NULLIF(btrim(x->>'fecha_hasta'), '') IS NOT NULL
    AND COALESCE(NULLIF(btrim(x->>'canal'), ''), 'galicia') IN ('galicia', 'mercadopago', 'galicia_facturada', 'morba_sf')
  ON CONFLICT (canal, nro_cuenta, fecha_hasta) DO UPDATE SET
    moneda = EXCLUDED.moneda,
    cbu = EXCLUDED.cbu,
    tipo_cuenta = EXCLUDED.tipo_cuenta,
    fecha_desde = EXCLUDED.fecha_desde,
    saldo_inicial = EXCLUDED.saldo_inicial,
    saldo_final = EXCLUDED.saldo_final,
    documento_id = EXCLUDED.documento_id,
    archivo = EXCLUDED.archivo,
    raw = EXCLUDED.raw;

  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;

GRANT EXECUTE ON FUNCTION public.eb_guardar_saldos(jsonb) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.eb_guardar_saldos(jsonb) FROM PUBLIC;

-- ========== 4. RPCs cajas ==========

CREATE OR REPLACE FUNCTION public.cf_guardar_movimientos(p_canal text, p_filas jsonb)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET statement_timeout = '60s'
SET lock_timeout = '30s'
AS $$
DECLARE
  n integer := 0;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sesión vencida. Recargá la página e iniciá sesión.' USING ERRCODE = '42501';
  END IF;
  IF NOT public.has_permission('cargar_cajas_fisicas') THEN
    RAISE EXCEPTION 'Sin permiso para cargar cajas físicas.' USING ERRCODE = '42501';
  END IF;
  IF p_canal IS NULL OR p_canal NOT IN ('galicia_facturada', 'morba_sf') THEN
    RAISE EXCEPTION 'Canal de caja inválido.';
  END IF;

  INSERT INTO public.cf_movimiento (
    canal, origen_id, fecha, fecha_hora, tipo, descripcion, contraparte, monto, moneda,
    categoria, cuenta_contable, credito, debito, saldo,
    archivo, fila_excel, pendiente_baja, raw, created_by
  )
  SELECT p_canal,
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
         NULLIF(btrim(x->>'archivo'), ''),
         CASE WHEN x->>'fila_excel' IS NULL OR btrim(x->>'fila_excel') = '' THEN NULL ELSE (x->>'fila_excel')::integer END,
         false,
         CASE WHEN x->'raw' IS NULL OR jsonb_typeof(x->'raw') = 'null' THEN NULL ELSE x->'raw' END,
         auth.uid()
  FROM jsonb_array_elements(COALESCE(p_filas, '[]'::jsonb)) AS x
  WHERE NULLIF(btrim(x->>'origen_id'), '') IS NOT NULL
  ON CONFLICT (canal, origen_id) DO UPDATE SET
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
    archivo = EXCLUDED.archivo,
    fila_excel = EXCLUDED.fila_excel,
    pendiente_baja = false,
    raw = EXCLUDED.raw;

  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;

GRANT EXECUTE ON FUNCTION public.cf_guardar_movimientos(text, jsonb) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.cf_guardar_movimientos(text, jsonb) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.cf_es_tesoreria_abierta(p_mov public.cf_movimiento)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT p_mov.origen_id LIKE 'id|%'
    AND COALESCE(p_mov.raw->>'formato', '') <> 'cierre'
    AND COALESCE(p_mov.archivo, '') NOT ILIKE '%cierre%'
    AND (
      COALESCE(p_mov.raw->>'formato', '') = 'tesoreria'
      OR COALESCE(p_mov.archivo, '') ILIKE '%tesoreria_%'
    );
$$;

CREATE OR REPLACE FUNCTION public.cf_marcar_tesoreria_abierta_ausente(
  p_canal text,
  p_origen_ids text[]
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  n integer := 0;
  v_ids text[];
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sesión vencida. Recargá la página e iniciá sesión.' USING ERRCODE = '42501';
  END IF;
  IF NOT public.has_permission('cargar_cajas_fisicas') THEN
    RAISE EXCEPTION 'Sin permiso para cargar cajas físicas.' USING ERRCODE = '42501';
  END IF;
  IF p_canal IS NULL OR p_canal NOT IN ('galicia_facturada', 'morba_sf') THEN
    RAISE EXCEPTION 'Canal de caja inválido.';
  END IF;

  v_ids := ARRAY(
    SELECT DISTINCT btrim(x)
    FROM unnest(COALESCE(p_origen_ids, ARRAY[]::text[])) AS x
    WHERE NULLIF(btrim(x), '') IS NOT NULL
  );

  UPDATE public.cf_movimiento m
  SET pendiente_baja = false
  WHERE m.canal = p_canal
    AND public.cf_es_tesoreria_abierta(m)
    AND m.origen_id = ANY (v_ids);

  UPDATE public.cf_movimiento m
  SET pendiente_baja = true
  WHERE m.canal = p_canal
    AND public.cf_es_tesoreria_abierta(m)
    AND COALESCE(cardinality(v_ids), 0) > 0
    AND NOT (m.origen_id = ANY (v_ids));

  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;

GRANT EXECUTE ON FUNCTION public.cf_marcar_tesoreria_abierta_ausente(text, text[]) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.cf_marcar_tesoreria_abierta_ausente(text, text[]) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.cf_confirmar_baja(p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_mov public.cf_movimiento%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sesión vencida. Recargá la página e iniciá sesión.' USING ERRCODE = '42501';
  END IF;
  IF NOT public.has_permission('cargar_cajas_fisicas') THEN
    RAISE EXCEPTION 'Sin permiso para eliminar movimientos de caja.' USING ERRCODE = '42501';
  END IF;
  IF p_id IS NULL THEN
    RAISE EXCEPTION 'Falta el movimiento a eliminar.';
  END IF;

  SELECT * INTO v_mov FROM public.cf_movimiento WHERE id = p_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'El movimiento ya no existe.';
  END IF;
  IF NOT v_mov.pendiente_baja THEN
    RAISE EXCEPTION 'Este movimiento no está marcado para eliminar.';
  END IF;

  DELETE FROM public.cf_movimiento WHERE id = p_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.cf_confirmar_baja(uuid) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.cf_confirmar_baja(uuid) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.cf_borrar_movimiento(p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sesión vencida. Recargá la página e iniciá sesión.' USING ERRCODE = '42501';
  END IF;
  IF NOT public.has_permission('cargar_cajas_fisicas') THEN
    RAISE EXCEPTION 'Sin permiso para eliminar movimientos de caja.' USING ERRCODE = '42501';
  END IF;
  IF p_id IS NULL THEN
    RAISE EXCEPTION 'Falta el movimiento a eliminar.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.cf_movimiento WHERE id = p_id) THEN
    RAISE EXCEPTION 'El movimiento ya no existe.';
  END IF;
  DELETE FROM public.cf_movimiento WHERE id = p_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.cf_borrar_movimiento(uuid) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.cf_borrar_movimiento(uuid) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.cf_guardar_saldo_caja(p_filas jsonb)
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
    RAISE EXCEPTION 'Sin permiso para cargar cajas físicas.' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.eb_saldo_extracto (
    canal, moneda, nro_cuenta, cbu, tipo_cuenta,
    fecha_desde, fecha_hasta, saldo_inicial, saldo_final,
    documento_id, archivo, raw, created_by
  )
  SELECT COALESCE(NULLIF(btrim(x->>'canal'), ''), 'galicia_facturada'),
         COALESCE(NULLIF(btrim(x->>'moneda'), ''), 'ARS'),
         COALESCE(NULLIF(btrim(x->>'nro_cuenta'), ''), COALESCE(NULLIF(btrim(x->>'canal'), ''), 'galicia_facturada')),
         NULL,
         COALESCE(NULLIF(btrim(x->>'tipo_cuenta'), ''), 'Caja física'),
         COALESCE(NULLIF(btrim(x->>'fecha_desde'), '')::date, public.fecha_hoy_argentina()),
         COALESCE(NULLIF(btrim(x->>'fecha_hasta'), '')::date, public.fecha_hoy_argentina()),
         CASE WHEN x->>'saldo_inicial' IS NULL OR btrim(x->>'saldo_inicial') = '' THEN NULL
              ELSE ROUND((x->>'saldo_inicial')::numeric, 2) END,
         ROUND(COALESCE((x->>'saldo_final')::numeric, 0), 2),
         NULLIF(btrim(x->>'documento_id'), ''),
         NULLIF(btrim(x->>'archivo'), ''),
         CASE WHEN x->'raw' IS NULL OR jsonb_typeof(x->'raw') = 'null' THEN NULL ELSE x->'raw' END,
         auth.uid()
  FROM jsonb_array_elements(COALESCE(p_filas, '[]'::jsonb)) AS x
  WHERE NULLIF(btrim(x->>'fecha_hasta'), '') IS NOT NULL
    AND COALESCE(NULLIF(btrim(x->>'canal'), ''), 'galicia_facturada') IN ('galicia_facturada', 'morba_sf')
  ON CONFLICT (canal, nro_cuenta, fecha_hasta) DO UPDATE SET
    moneda = EXCLUDED.moneda,
    tipo_cuenta = EXCLUDED.tipo_cuenta,
    fecha_desde = EXCLUDED.fecha_desde,
    saldo_inicial = EXCLUDED.saldo_inicial,
    saldo_final = EXCLUDED.saldo_final,
    documento_id = EXCLUDED.documento_id,
    archivo = EXCLUDED.archivo,
    raw = EXCLUDED.raw;

  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;

GRANT EXECUTE ON FUNCTION public.cf_guardar_saldo_caja(jsonb) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.cf_guardar_saldo_caja(jsonb) FROM PUBLIC;

COMMENT ON FUNCTION public.cf_guardar_saldo_caja(jsonb) IS
  'Upsert del saldo de cajas físicas (Galicia-f / Morba-s/f) para Saldos extractos. Permiso cargar_cajas_fisicas.';
