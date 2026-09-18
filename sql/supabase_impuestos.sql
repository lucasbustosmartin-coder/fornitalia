-- Fornitalia – Impuestos (percepciones Mercado Pago).
-- Primera solapa: Mercado Pago. Primer reporte: CIBBPP (IIBB Régimen General Buenos Aires).
-- Cruce por Número de movimiento contra el extracto MP de Conciliación Bancaria.
-- Requiere public.fecha_hoy_argentina() y has_permission.

-- ========== 1. Permisos ==========

INSERT INTO public.app_permission (permission, description) VALUES
  ('ver_impuestos', 'Ver menú Impuestos'),
  ('cargar_impuestos', 'Cargar reportes de percepción (Mercado Pago CIBBPP y siguientes)'),
  ('exportar_impuestos', 'Exportar listados de Impuestos a Excel')
ON CONFLICT (permission) DO UPDATE SET description = EXCLUDED.description;

INSERT INTO public.app_role_permission (role, permission)
SELECT r.role, p.permission
FROM (VALUES ('admin'), ('encargado')) AS r(role)
CROSS JOIN (
  VALUES
    ('ver_impuestos'),
    ('cargar_impuestos'),
    ('exportar_impuestos')
) AS p(permission)
ON CONFLICT (role, permission) DO NOTHING;

-- ========== 2. Tabla ==========

CREATE TABLE IF NOT EXISTS public.imp_percepcion_mp (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  regimen text NOT NULL CHECK (regimen IN ('CIBBPP', 'CIBCPP', 'CIVAPP')),
  origen_id text NOT NULL,
  numero_cargo text,
  fecha date NOT NULL DEFAULT public.fecha_hoy_argentina(),
  factura_legal text,
  detalle text,
  operacion_relacionada text,
  importe_con_iva numeric(18,4),
  importe_sin_iva numeric(18,4),
  base_imponible numeric(18,4),
  alicuota numeric(12,8),
  monto_percibido numeric(18,4),
  archivo text,
  fila_excel integer,
  periodo_reporte text,
  raw jsonb,
  tesoreria_id uuid REFERENCES public.cb_movimiento(id) ON DELETE SET NULL,
  tesoreria_grupo uuid,
  tesoreria_justificacion text,
  tesoreria_diferencia numeric(18,2),
  tesoreria_at timestamptz,
  tesoreria_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  CONSTRAINT imp_percepcion_mp_unica UNIQUE (regimen, origen_id)
);

CREATE INDEX IF NOT EXISTS idx_imp_percepcion_mp_regimen_fecha
  ON public.imp_percepcion_mp (regimen, fecha);

COMMENT ON TABLE public.imp_percepcion_mp IS
  'Percepciones Mercado Pago por régimen (CIBBPP = IIBB RG Buenos Aires). origen_id = Número de movimiento del extracto.';

CREATE OR REPLACE FUNCTION public.imp_set_updated_at()
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

DROP TRIGGER IF EXISTS trg_imp_percepcion_mp_updated ON public.imp_percepcion_mp;
CREATE TRIGGER trg_imp_percepcion_mp_updated
  BEFORE INSERT OR UPDATE ON public.imp_percepcion_mp
  FOR EACH ROW EXECUTE FUNCTION public.imp_set_updated_at();

ALTER TABLE public.imp_percepcion_mp ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.imp_percepcion_mp FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.imp_percepcion_mp TO authenticated;

DROP POLICY IF EXISTS imp_percepcion_mp_select ON public.imp_percepcion_mp;
CREATE POLICY imp_percepcion_mp_select ON public.imp_percepcion_mp FOR SELECT TO authenticated
  USING (public.has_permission('ver_impuestos'));

DROP POLICY IF EXISTS imp_percepcion_mp_insert ON public.imp_percepcion_mp;
CREATE POLICY imp_percepcion_mp_insert ON public.imp_percepcion_mp FOR INSERT TO authenticated
  WITH CHECK (public.has_permission('cargar_impuestos'));

DROP POLICY IF EXISTS imp_percepcion_mp_update ON public.imp_percepcion_mp;
CREATE POLICY imp_percepcion_mp_update ON public.imp_percepcion_mp FOR UPDATE TO authenticated
  USING (public.has_permission('cargar_impuestos'))
  WITH CHECK (public.has_permission('cargar_impuestos'));

DROP POLICY IF EXISTS imp_percepcion_mp_delete ON public.imp_percepcion_mp;
CREATE POLICY imp_percepcion_mp_delete ON public.imp_percepcion_mp FOR DELETE TO authenticated
  USING (public.has_permission('cargar_impuestos'));

-- ========== 3. RPCs ==========

CREATE OR REPLACE FUNCTION public.imp_guardar_percepcion_mp(p_regimen text, p_filas jsonb)
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
  IF NOT public.has_permission('cargar_impuestos') THEN
    RAISE EXCEPTION 'Sin permiso para cargar impuestos.' USING ERRCODE = '42501';
  END IF;
  IF p_regimen IS NULL OR p_regimen NOT IN ('CIBBPP', 'CIBCPP', 'CIVAPP') THEN
    RAISE EXCEPTION 'Régimen de percepción inválido.';
  END IF;

  INSERT INTO public.imp_percepcion_mp (
    regimen, origen_id, numero_cargo, fecha, factura_legal, detalle, operacion_relacionada,
    importe_con_iva, importe_sin_iva, base_imponible, alicuota, monto_percibido,
    archivo, fila_excel, periodo_reporte, raw, created_by
  )
  SELECT p_regimen,
         NULLIF(btrim(x->>'origen_id'), ''),
         NULLIF(btrim(x->>'numero_cargo'), ''),
         COALESCE(NULLIF(btrim(x->>'fecha'), '')::date, public.fecha_hoy_argentina()),
         NULLIF(btrim(x->>'factura_legal'), ''),
         NULLIF(btrim(x->>'detalle'), ''),
         NULLIF(btrim(x->>'operacion_relacionada'), ''),
         CASE WHEN x->>'importe_con_iva' IS NULL OR btrim(x->>'importe_con_iva') = '' THEN NULL ELSE ROUND((x->>'importe_con_iva')::numeric, 4) END,
         CASE WHEN x->>'importe_sin_iva' IS NULL OR btrim(x->>'importe_sin_iva') = '' THEN NULL ELSE ROUND((x->>'importe_sin_iva')::numeric, 4) END,
         CASE WHEN x->>'base_imponible' IS NULL OR btrim(x->>'base_imponible') = '' THEN NULL ELSE ROUND((x->>'base_imponible')::numeric, 4) END,
         CASE WHEN x->>'alicuota' IS NULL OR btrim(x->>'alicuota') = '' THEN NULL ELSE (x->>'alicuota')::numeric END,
         CASE WHEN x->>'monto_percibido' IS NULL OR btrim(x->>'monto_percibido') = '' THEN NULL ELSE ROUND((x->>'monto_percibido')::numeric, 4) END,
         NULLIF(btrim(x->>'archivo'), ''),
         CASE WHEN x->>'fila_excel' IS NULL OR btrim(x->>'fila_excel') = '' THEN NULL ELSE (x->>'fila_excel')::integer END,
         NULLIF(btrim(x->>'periodo_reporte'), ''),
         CASE WHEN x->'raw' IS NULL OR jsonb_typeof(x->'raw') = 'null' THEN NULL ELSE x->'raw' END,
         auth.uid()
  FROM jsonb_array_elements(COALESCE(p_filas, '[]'::jsonb)) AS x
  WHERE NULLIF(btrim(x->>'origen_id'), '') IS NOT NULL
  ON CONFLICT (regimen, origen_id) DO UPDATE SET
    numero_cargo = EXCLUDED.numero_cargo,
    fecha = EXCLUDED.fecha,
    factura_legal = EXCLUDED.factura_legal,
    detalle = EXCLUDED.detalle,
    operacion_relacionada = EXCLUDED.operacion_relacionada,
    importe_con_iva = EXCLUDED.importe_con_iva,
    importe_sin_iva = EXCLUDED.importe_sin_iva,
    base_imponible = EXCLUDED.base_imponible,
    alicuota = EXCLUDED.alicuota,
    monto_percibido = EXCLUDED.monto_percibido,
    archivo = EXCLUDED.archivo,
    fila_excel = EXCLUDED.fila_excel,
    periodo_reporte = EXCLUDED.periodo_reporte,
    raw = EXCLUDED.raw;

  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;

GRANT EXECUTE ON FUNCTION public.imp_guardar_percepcion_mp(text, jsonb) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.imp_guardar_percepcion_mp(text, jsonb) FROM PUBLIC;

DROP FUNCTION IF EXISTS public.imp_listar_percepcion_mp(text);

CREATE OR REPLACE FUNCTION public.imp_listar_percepcion_mp(p_regimen text)
RETURNS TABLE (
  id uuid,
  regimen text,
  origen_id text,
  numero_cargo text,
  fecha date,
  factura_legal text,
  detalle text,
  operacion_relacionada text,
  importe_con_iva numeric,
  importe_sin_iva numeric,
  base_imponible numeric,
  alicuota numeric,
  monto_percibido numeric,
  archivo text,
  fila_excel integer,
  periodo_reporte text,
  en_extracto boolean,
  conciliado boolean,
  no_requiere boolean,
  extracto_tipo text,
  extracto_monto numeric,
  extracto_fecha date,
  tesoreria_id uuid,
  tesoreria_fecha date,
  tesoreria_monto numeric,
  tesoreria_descripcion text
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sesión vencida. Recargá la página e iniciá sesión.' USING ERRCODE = '42501';
  END IF;
  IF NOT public.has_permission('ver_impuestos') THEN
    RAISE EXCEPTION 'Sin permiso para ver impuestos.' USING ERRCODE = '42501';
  END IF;
  IF p_regimen IS NULL OR p_regimen NOT IN ('CIBBPP', 'CIBCPP', 'CIVAPP') THEN
    RAISE EXCEPTION 'Régimen de percepción inválido.';
  END IF;

  RETURN QUERY
  SELECT
    p.id,
    p.regimen,
    p.origen_id,
    p.numero_cargo,
    p.fecha,
    p.factura_legal,
    p.detalle,
    p.operacion_relacionada,
    p.importe_con_iva,
    p.importe_sin_iva,
    p.base_imponible,
    p.alicuota,
    p.monto_percibido,
    p.archivo,
    p.fila_excel,
    p.periodo_reporte,
    (b.id IS NOT NULL) AS en_extracto,
    CASE
      WHEN p.tesoreria_id IS NOT NULL THEN true
      WHEN b.id IS NULL THEN false
      WHEN COALESCE(b.no_requiere_conciliacion, false) THEN true
      ELSE EXISTS (
        SELECT 1
        FROM public.cb_match x
        WHERE x.canal = 'mercadopago'
          AND x.estado = 'confirmado'
          AND (
            x.banco_id = b.id
            OR b.id = ANY (COALESCE(x.banco_ids, ARRAY[]::uuid[]))
          )
      )
    END AS conciliado,
    COALESCE(b.no_requiere_conciliacion, false) AS no_requiere,
    b.tipo AS extracto_tipo,
    b.monto AS extracto_monto,
    b.fecha AS extracto_fecha,
    p.tesoreria_id,
    t.fecha AS tesoreria_fecha,
    t.monto AS tesoreria_monto,
    t.descripcion AS tesoreria_descripcion
  FROM public.imp_percepcion_mp p
  LEFT JOIN public.cb_movimiento b
    ON b.canal = 'mercadopago'
   AND b.origen = 'banco'
   AND (b.origen_id = p.origen_id OR COALESCE(b.id_movimiento_banco, '') = p.origen_id)
  LEFT JOIN public.cb_movimiento t
    ON t.id = p.tesoreria_id
  WHERE p.regimen = imp_listar_percepcion_mp.p_regimen
  ORDER BY p.fecha DESC, p.origen_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.imp_listar_percepcion_mp(text) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.imp_listar_percepcion_mp(text) FROM PUBLIC;
