-- Saldos extractos: canal Mercado Pago (Carta de saldo PDF).
-- Requiere sql/supabase_saldos_extractos.sql.

ALTER TABLE public.eb_saldo_extracto DROP CONSTRAINT IF EXISTS eb_saldo_extracto_canal_check;
ALTER TABLE public.eb_saldo_extracto
  ADD CONSTRAINT eb_saldo_extracto_canal_check
  CHECK (canal IN ('galicia', 'mercadopago'));

COMMENT ON TABLE public.eb_saldo_extracto IS
  'Un renglón por resumen/carta de saldo. Galicia PDF (período) y Mercado Pago Carta de saldo (al día). Upsert por canal+cuenta+fecha_hasta.';

UPDATE public.app_permission
SET description = 'Cargar PDFs de resúmenes de cuenta (Galicia y Mercado Pago)'
WHERE permission = 'cargar_saldos_extractos';

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
    AND COALESCE(NULLIF(btrim(x->>'canal'), ''), 'galicia') IN ('galicia', 'mercadopago')
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
  'Upsert incremental de saldos (Galicia y Mercado Pago). Nunca borra filas previas. Clave: canal + nro_cuenta + fecha_hasta.';
