-- Credicoop (conciliación, botón negro), cajas Efectivo-s/f ARS/USD, matriz cat/cuenta → EF.
-- Flujo de caja pasa a leer tesorería (cb_movimiento sistema + cf_movimiento) + esta matriz.

-- ========== 1. Canales CB: credicoop ==========
ALTER TABLE public.cb_movimiento DROP CONSTRAINT IF EXISTS cb_movimiento_canal_check;
ALTER TABLE public.cb_movimiento
  ADD CONSTRAINT cb_movimiento_canal_check
  CHECK (canal IN ('mercadopago', 'galicia', 'galicia_usd', 'credicoop'));

ALTER TABLE public.cb_match DROP CONSTRAINT IF EXISTS cb_match_canal_check;
ALTER TABLE public.cb_match
  ADD CONSTRAINT cb_match_canal_check
  CHECK (canal IN ('mercadopago', 'galicia', 'galicia_usd', 'credicoop'));

ALTER TABLE public.cb_dup_descartado DROP CONSTRAINT IF EXISTS cb_dup_descartado_canal_check;
ALTER TABLE public.cb_dup_descartado
  ADD CONSTRAINT cb_dup_descartado_canal_check
  CHECK (canal IN ('mercadopago', 'galicia', 'galicia_usd', 'credicoop'));

ALTER TABLE public.cb_movimiento_eliminado DROP CONSTRAINT IF EXISTS cb_movimiento_eliminado_canal_check;
ALTER TABLE public.cb_movimiento_eliminado
  ADD CONSTRAINT cb_movimiento_eliminado_canal_check
  CHECK (canal IN ('mercadopago', 'galicia', 'galicia_usd', 'credicoop'));

COMMENT ON TABLE public.cb_movimiento IS
  'Movimientos de conciliación. Canales: mercadopago, galicia (ARS), galicia_usd y credicoop (Transferencia Credicoop).';

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
      AND p.prosrc LIKE '%''mercadopago'', ''galicia'', ''galicia_usd''%'
      AND p.prosrc NOT LIKE '%credicoop%'
  LOOP
    src := pg_get_functiondef(r.oid);
    src := replace(src,
      '''mercadopago'', ''galicia'', ''galicia_usd''',
      '''mercadopago'', ''galicia'', ''galicia_usd'', ''credicoop''');
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
  IF v_mov.origen <> 'banco' OR v_mov.canal NOT IN ('galicia', 'galicia_usd', 'credicoop') THEN
    RAISE EXCEPTION 'Solo se pueden eliminar movimientos del extracto de Galicia o Credicoop (solapa Solo banco).';
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

-- ========== 2. Cajas físicas: Efectivo-s/f ARS y USD ==========
ALTER TABLE public.cf_movimiento DROP CONSTRAINT IF EXISTS cf_movimiento_canal_check;
ALTER TABLE public.cf_movimiento
  ADD CONSTRAINT cf_movimiento_canal_check
  CHECK (canal IN (
    'galicia_facturada', 'morba_sf', 'galicia_dolar', 'efectivo_sf', 'efectivo_sf_usd'
  ));

COMMENT ON TABLE public.cf_movimiento IS
  'Cajas físicas. Efectivo-f ARS/USD, Morba-s/f ARS, Efectivo-s/f ARS (Efectivo Pesos sin factura) y Efectivo-s/f USD.';

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
      AND p.proname LIKE 'cf_%'
      AND p.prosrc LIKE '%''galicia_facturada'', ''morba_sf'', ''galicia_dolar''%'
      AND p.prosrc NOT LIKE '%efectivo_sf%'
  LOOP
    src := pg_get_functiondef(r.oid);
    src := replace(src,
      '''galicia_facturada'', ''morba_sf'', ''galicia_dolar''',
      '''galicia_facturada'', ''morba_sf'', ''galicia_dolar'', ''efectivo_sf'', ''efectivo_sf_usd''');
    EXECUTE src;
  END LOOP;
END $$;

ALTER TABLE public.eb_saldo_extracto DROP CONSTRAINT IF EXISTS eb_saldo_extracto_canal_check;
ALTER TABLE public.eb_saldo_extracto
  ADD CONSTRAINT eb_saldo_extracto_canal_check
  CHECK (canal IN (
    'galicia', 'mercadopago', 'galicia_facturada', 'morba_sf', 'galicia_dolar', 'galicia_usd',
    'credicoop', 'efectivo_sf', 'efectivo_sf_usd'
  ));

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
      AND p.proname IN ('eb_guardar_saldos', 'cf_guardar_saldo_caja')
  LOOP
    src := pg_get_functiondef(r.oid);
    src := replace(src,
      '''galicia'', ''mercadopago'', ''galicia_facturada'', ''morba_sf'', ''galicia_dolar'', ''galicia_usd''',
      '''galicia'', ''mercadopago'', ''galicia_facturada'', ''morba_sf'', ''galicia_dolar'', ''galicia_usd'', ''credicoop'', ''efectivo_sf'', ''efectivo_sf_usd''');
    src := replace(src,
      '''galicia_facturada'', ''morba_sf'', ''galicia_dolar''',
      '''galicia_facturada'', ''morba_sf'', ''galicia_dolar'', ''efectivo_sf'', ''efectivo_sf_usd''');
    EXECUTE src;
  END LOOP;
END $$;

-- ========== 3. Matriz categoría / cuenta / tipo → EF ==========
CREATE TABLE IF NOT EXISTS public.matriz_cat_cuenta_ef (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  categoria text NOT NULL,
  cuenta_contable text NOT NULL,
  tipo_movimiento text NOT NULL CHECK (tipo_movimiento IN ('Ingreso', 'Egreso')),
  ef_item text NOT NULL,
  ef_subitem text NOT NULL,
  costo_directo text,
  costo_indirecto text,
  vigente boolean NOT NULL DEFAULT true,
  notas text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_by uuid
);

CREATE UNIQUE INDEX IF NOT EXISTS matriz_cat_cuenta_ef_unica
  ON public.matriz_cat_cuenta_ef (lower(btrim(categoria)), lower(btrim(cuenta_contable)), tipo_movimiento);

CREATE INDEX IF NOT EXISTS matriz_cat_cuenta_ef_ef
  ON public.matriz_cat_cuenta_ef (ef_item, ef_subitem);

COMMENT ON TABLE public.matriz_cat_cuenta_ef IS
  'Relación canónica tesorería: categoría + cuenta + tipo Ingreso/Egreso → ítem y subítem del Estado Financiero. Nombres = tesorería.';

ALTER TABLE public.matriz_cat_cuenta_ef ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS matriz_cat_cuenta_ef_select ON public.matriz_cat_cuenta_ef;
CREATE POLICY matriz_cat_cuenta_ef_select
  ON public.matriz_cat_cuenta_ef FOR SELECT USING (true);

DROP POLICY IF EXISTS matriz_cat_cuenta_ef_write ON public.matriz_cat_cuenta_ef;
CREATE POLICY matriz_cat_cuenta_ef_write
  ON public.matriz_cat_cuenta_ef FOR ALL TO authenticated
  USING (public.has_permission('editar_matriz_ef'))
  WITH CHECK (public.has_permission('editar_matriz_ef'));

CREATE OR REPLACE FUNCTION public.matriz_cat_cuenta_ef_set_updated()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  NEW.categoria = btrim(NEW.categoria);
  NEW.cuenta_contable = btrim(NEW.cuenta_contable);
  NEW.ef_item = btrim(NEW.ef_item);
  NEW.ef_subitem = btrim(NEW.ef_subitem);
  IF TG_OP = 'INSERT' AND NEW.created_by IS NULL THEN
    NEW.created_by = auth.uid();
  END IF;
  NEW.updated_by = auth.uid();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_matriz_cat_cuenta_ef_updated ON public.matriz_cat_cuenta_ef;
CREATE TRIGGER trg_matriz_cat_cuenta_ef_updated
  BEFORE INSERT OR UPDATE ON public.matriz_cat_cuenta_ef
  FOR EACH ROW EXECUTE FUNCTION public.matriz_cat_cuenta_ef_set_updated();

INSERT INTO public.app_permission (permission, description) VALUES
  ('ver_matriz_ef', 'Ver menú Matriz EF (categoría, cuenta, ítem y subítem)'),
  ('editar_matriz_ef', 'Alta y edición de relaciones categoría/cuenta → Estado Financiero')
ON CONFLICT (permission) DO UPDATE SET description = EXCLUDED.description;

GRANT SELECT ON public.matriz_cat_cuenta_ef TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.matriz_cat_cuenta_ef TO authenticated;

INSERT INTO public.app_role_permission (role, permission)
SELECT r.role, p.permission
FROM (VALUES ('admin'), ('encargado')) AS r(role)
CROSS JOIN (VALUES ('ver_matriz_ef'), ('editar_matriz_ef')) AS p(permission)
ON CONFLICT (role, permission) DO NOTHING;

-- Semilla: pares únicos de transacciones, nombres alineados a tesorería.
-- Muebles y Utiles: solo Inversión (no Costos indirectos).
INSERT INTO public.matriz_cat_cuenta_ef (
  categoria, cuenta_contable, tipo_movimiento, ef_item, ef_subitem, costo_directo, costo_indirecto, notas
)
SELECT DISTINCT ON (
    lower(btrim(x.categoria)),
    lower(btrim(x.cuenta_contable)),
    x.tipo_movimiento
  )
  x.categoria,
  x.cuenta_contable,
  x.tipo_movimiento,
  x.ef_item,
  x.ef_subitem,
  x.costo_directo,
  x.costo_indirecto,
  'semilla desde transacciones'
FROM (
  SELECT
    CASE btrim(t.nueva_categoria)
      WHEN 'MP - Costo Financiero' THEN 'Costo por intereses absorbidos - Mercado Pago'
      ELSE btrim(t.nueva_categoria)
    END AS categoria,
    CASE btrim(t.nueva_cuenta_contable)
      WHEN 'Percepción de IVA Sufrida' THEN 'Percepción / Retención de IVA Sufrida'
      WHEN 'Retención Ingresos Brutos Sufrida' THEN 'Percepción / Retención Ingresos Brutos Sufrida'
      ELSE btrim(t.nueva_cuenta_contable)
    END AS cuenta_contable,
    btrim(t.tipo_movimiento) AS tipo_movimiento,
    btrim(t.ef_item) AS ef_item,
    btrim(t.ef_subitem) AS ef_subitem,
    t.costo_directo,
    t.costo_indirecto,
    COUNT(*) AS n
  FROM public.transacciones t
  WHERE btrim(COALESCE(t.tipo_movimiento, '')) IN ('Ingreso', 'Egreso')
    AND NULLIF(btrim(t.nueva_categoria), '') IS NOT NULL
    AND NULLIF(btrim(t.nueva_cuenta_contable), '') IS NOT NULL
    AND NULLIF(btrim(t.ef_item), '') IS NOT NULL
    AND NULLIF(btrim(t.ef_subitem), '') IS NOT NULL
    AND NOT (
      lower(btrim(t.nueva_categoria)) = 'muebles y utiles'
      AND t.ef_item ILIKE '%INDIRECTOS%'
    )
  GROUP BY 1, 2, 3, 4, 5, 6, 7
) x
WHERE NOT EXISTS (
  SELECT 1 FROM public.matriz_cat_cuenta_ef m
  WHERE lower(btrim(m.categoria)) = lower(btrim(x.categoria))
    AND lower(btrim(m.cuenta_contable)) = lower(btrim(x.cuenta_contable))
    AND m.tipo_movimiento = x.tipo_movimiento
)
ORDER BY lower(btrim(x.categoria)), lower(btrim(x.cuenta_contable)), x.tipo_movimiento, x.n DESC;

-- Pares de tesorería actuales que no estaban en la base vieja.
INSERT INTO public.matriz_cat_cuenta_ef (
  categoria, cuenta_contable, tipo_movimiento, ef_item, ef_subitem, notas
)
SELECT v.categoria, v.cuenta_contable, v.tipo_movimiento, v.ef_item, v.ef_subitem, v.notas
FROM (VALUES
  ('Impuestos', 'Percepción / Retención de Ganancias Sufrida', 'Egreso',
   'ANTICIPOS DE IMPUESTOS', 'Retenciones/Percepciones sufridas en Facturas',
   'semilla tesorería (no estaba en extracto viejo)')
) AS v(categoria, cuenta_contable, tipo_movimiento, ef_item, ef_subitem, notas)
WHERE NOT EXISTS (
  SELECT 1 FROM public.matriz_cat_cuenta_ef m
  WHERE lower(btrim(m.categoria)) = lower(btrim(v.categoria))
    AND lower(btrim(m.cuenta_contable)) = lower(btrim(v.cuenta_contable))
    AND m.tipo_movimiento = v.tipo_movimiento
);
