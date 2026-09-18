-- Conciliación Bancaria: canal galicia_usd (extracto CCE + tesorería Transferencia Galicia Dolar).
-- Los importes de conciliación quedan en USD. El saldo de corte se pesifica al MEP en Saldos extractos.

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT c.conname, c.conrelid::regclass AS tbl
    FROM pg_constraint c
    WHERE c.contype = 'c'
      AND c.conrelid IN ('public.cb_movimiento'::regclass, 'public.cb_match'::regclass)
      AND pg_get_constraintdef(c.oid) ILIKE '%mercadopago%'
  LOOP
    EXECUTE format('ALTER TABLE %s DROP CONSTRAINT IF EXISTS %I', r.tbl, r.conname);
  END LOOP;
END $$;

ALTER TABLE public.cb_movimiento
  ADD CONSTRAINT cb_movimiento_canal_check
  CHECK (canal IN ('mercadopago', 'galicia', 'galicia_usd'));

ALTER TABLE public.cb_match
  ADD CONSTRAINT cb_match_canal_check
  CHECK (canal IN ('mercadopago', 'galicia', 'galicia_usd'));

ALTER TABLE public.eb_saldo_extracto DROP CONSTRAINT IF EXISTS eb_saldo_extracto_canal_check;
ALTER TABLE public.eb_saldo_extracto
  ADD CONSTRAINT eb_saldo_extracto_canal_check
  CHECK (canal IN (
    'galicia', 'mercadopago', 'galicia_facturada', 'morba_sf', 'galicia_dolar', 'galicia_usd'
  ));

COMMENT ON TABLE public.cb_movimiento IS
  'Movimientos de conciliación. Canales: mercadopago, galicia (ARS) y galicia_usd (extracto CCE / tesorería Transferencia Galicia Dolar).';

DO $$
DECLARE
  r record;
  src text;
BEGIN
  FOR r IN
    SELECT p.oid
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prokind = 'f'
      AND p.proname LIKE 'cb_%'
      AND p.prosrc LIKE '%''mercadopago'', ''galicia''%'
      AND p.prosrc NOT LIKE '%galicia_usd%'
  LOOP
    src := pg_get_functiondef(r.oid);
    src := replace(src, '''mercadopago'', ''galicia''', '''mercadopago'', ''galicia'', ''galicia_usd''');
    EXECUTE src;
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.cb_borrar_movimiento_banco_galicia(p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_mov public.cb_movimiento%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sesión vencida. Recargá la página e iniciá sesión.' USING ERRCODE = '42501';
  END IF;
  IF NOT public.has_permission('cargar_conciliacion_bancaria') THEN
    RAISE EXCEPTION 'Sin permiso para eliminar movimientos del extracto.' USING ERRCODE = '42501';
  END IF;
  IF p_id IS NULL THEN
    RAISE EXCEPTION 'Falta el movimiento a eliminar.';
  END IF;

  SELECT * INTO v_mov FROM public.cb_movimiento WHERE id = p_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'El movimiento ya no existe.';
  END IF;
  IF v_mov.origen <> 'banco' OR v_mov.canal NOT IN ('galicia', 'galicia_usd') THEN
    RAISE EXCEPTION 'Solo se pueden eliminar movimientos del extracto de Galicia (solapa Solo banco).';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.cb_match m
    WHERE m.estado IN ('sugerido', 'confirmado')
      AND (
        m.banco_id = p_id
        OR m.sistema_id = p_id
        OR public.cb_match_ids_lado(m, 'banco') && ARRAY[p_id]
        OR public.cb_match_ids_lado(m, 'sistema') && ARRAY[p_id]
      )
  ) THEN
    RAISE EXCEPTION 'Este movimiento está en una conciliación activa. Deshacé o descartá esa pareja primero.';
  END IF;

  DELETE FROM public.cb_match
  WHERE estado = 'rechazado'
    AND (
      banco_id = p_id
      OR sistema_id = p_id
      OR COALESCE(banco_ids, ARRAY[]::uuid[]) && ARRAY[p_id]
      OR COALESCE(sistema_ids, ARRAY[]::uuid[]) && ARRAY[p_id]
    );

  DELETE FROM public.cb_movimiento WHERE id = p_id;
END;
$$;

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
  IF NOT public.has_permission('cargar_saldos_extractos')
     AND NOT public.has_permission('cargar_cajas_fisicas')
     AND NOT public.has_permission('cargar_conciliacion_bancaria') THEN
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
    AND COALESCE(NULLIF(btrim(x->>'canal'), ''), 'galicia') IN (
      'galicia', 'mercadopago', 'galicia_facturada', 'morba_sf', 'galicia_dolar', 'galicia_usd'
    )
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

GRANT EXECUTE ON FUNCTION public.cb_borrar_movimiento_banco_galicia(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.eb_guardar_saldos(jsonb) TO authenticated;
