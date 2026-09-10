-- Fornitalia – Saldos de extractos bancarios (resúmenes de cuenta).
-- Arranca con Galicia (PDF Resumen de Cuenta Corriente). Carga incremental, sin borrar previos.
-- Requiere public.fecha_hoy_argentina() y has_permission.

-- ========== 1. Permisos ==========

INSERT INTO public.app_permission (permission, description) VALUES
  ('ver_saldos_extractos', 'Ver menú Saldos extractos (serie de saldos de resúmenes bancarios)'),
  ('cargar_saldos_extractos', 'Cargar PDFs de resúmenes de cuenta (Galicia y próximos bancos)'),
  ('exportar_saldos_extractos', 'Exportar la serie de saldos a Excel')
ON CONFLICT (permission) DO UPDATE SET description = EXCLUDED.description;

INSERT INTO public.app_role_permission (role, permission)
SELECT r.role, p.permission
FROM (VALUES ('admin'), ('encargado')) AS r(role)
CROSS JOIN (
  VALUES
    ('ver_saldos_extractos'),
    ('cargar_saldos_extractos'),
    ('exportar_saldos_extractos')
) AS p(permission)
ON CONFLICT (role, permission) DO NOTHING;

-- ========== 2. Tabla ==========

CREATE TABLE IF NOT EXISTS public.eb_saldo_extracto (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  canal text NOT NULL CHECK (canal IN ('galicia')),
  moneda text NOT NULL DEFAULT 'ARS',
  nro_cuenta text NOT NULL DEFAULT '',
  cbu text,
  tipo_cuenta text,
  fecha_desde date NOT NULL DEFAULT public.fecha_hoy_argentina(),
  fecha_hasta date NOT NULL DEFAULT public.fecha_hoy_argentina(),
  saldo_inicial numeric(18,2),
  saldo_final numeric(18,2) NOT NULL,
  documento_id text,
  archivo text,
  raw jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  CONSTRAINT eb_saldo_extracto_unica UNIQUE (canal, nro_cuenta, fecha_hasta)
);

CREATE INDEX IF NOT EXISTS idx_eb_saldo_extracto_canal_fecha
  ON public.eb_saldo_extracto (canal, fecha_hasta);

COMMENT ON TABLE public.eb_saldo_extracto IS
  'Un renglón por resumen de cuenta: saldo inicial y de cierre del período. Galicia PDF; upsert por canal+cuenta+fecha_hasta.';

-- ========== 3. Trigger updated_at ==========

CREATE OR REPLACE FUNCTION public.eb_set_updated_at()
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

DROP TRIGGER IF EXISTS trg_eb_saldo_extracto_updated ON public.eb_saldo_extracto;
CREATE TRIGGER trg_eb_saldo_extracto_updated
  BEFORE INSERT OR UPDATE ON public.eb_saldo_extracto
  FOR EACH ROW EXECUTE FUNCTION public.eb_set_updated_at();

-- ========== 4. RLS ==========

ALTER TABLE public.eb_saldo_extracto ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.eb_saldo_extracto FROM anon;
GRANT SELECT, INSERT, UPDATE ON TABLE public.eb_saldo_extracto TO authenticated;

DROP POLICY IF EXISTS eb_saldo_extracto_select ON public.eb_saldo_extracto;
CREATE POLICY eb_saldo_extracto_select ON public.eb_saldo_extracto FOR SELECT TO authenticated
  USING (public.has_permission('ver_saldos_extractos'));

DROP POLICY IF EXISTS eb_saldo_extracto_insert ON public.eb_saldo_extracto;
CREATE POLICY eb_saldo_extracto_insert ON public.eb_saldo_extracto FOR INSERT TO authenticated
  WITH CHECK (public.has_permission('cargar_saldos_extractos'));

DROP POLICY IF EXISTS eb_saldo_extracto_update ON public.eb_saldo_extracto;
CREATE POLICY eb_saldo_extracto_update ON public.eb_saldo_extracto FOR UPDATE TO authenticated
  USING (public.has_permission('cargar_saldos_extractos'))
  WITH CHECK (public.has_permission('cargar_saldos_extractos'));

-- ========== 5. RPC upsert ==========

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
    AND COALESCE(NULLIF(btrim(x->>'canal'), ''), 'galicia') IN ('galicia')
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

COMMENT ON FUNCTION public.eb_guardar_saldos(jsonb) IS
  'Upsert incremental de saldos de resúmenes. Nunca borra filas previas. Clave: canal + nro_cuenta + fecha_hasta.';
