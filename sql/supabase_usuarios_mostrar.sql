-- Catálogo de usuarios para columnas de auditoría en la app
-- (nombre para mostrar + email al pasar el mouse).
-- Backfill histórico → lucas.bustos.martin@gmail.com (LB).
-- Ejecutar en Supabase SQL Editor si no se aplicó por migración.

CREATE OR REPLACE FUNCTION public.get_usuarios_mostrar()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT COALESCE((
    SELECT jsonb_agg(
      jsonb_build_object(
        'id', p.id,
        'email', p.email,
        'nombre_usuario', p.nombre_usuario
      )
      ORDER BY public.user_profile_label(p.nombre_usuario, p.email), p.email
    )
    FROM public.user_profiles p
    WHERE p.email IS NOT NULL AND length(trim(both from p.email)) > 0
  ), '[]'::jsonb);
$$;

COMMENT ON FUNCTION public.get_usuarios_mostrar() IS
  'Lista id, email y nombre_usuario de cuentas reales (con email) para mostrar actor en tablas.';

GRANT EXECUTE ON FUNCTION public.get_usuarios_mostrar() TO authenticated;
REVOKE EXECUTE ON FUNCTION public.get_usuarios_mostrar() FROM PUBLIC;

ALTER TABLE public.cb_movimiento ADD COLUMN IF NOT EXISTS updated_by uuid;
ALTER TABLE public.cf_movimiento ADD COLUMN IF NOT EXISTS updated_by uuid;
ALTER TABLE public.eb_saldo_extracto ADD COLUMN IF NOT EXISTS updated_by uuid;
ALTER TABLE public.imp_percepcion_mp ADD COLUMN IF NOT EXISTS updated_by uuid;
ALTER TABLE public.ef_estructura ADD COLUMN IF NOT EXISTS created_by uuid;
ALTER TABLE public.ef_estructura ADD COLUMN IF NOT EXISTS updated_by uuid;

COMMENT ON COLUMN public.cb_movimiento.updated_by IS 'Usuario que hizo el último cambio (upload/update).';
COMMENT ON COLUMN public.cf_movimiento.updated_by IS 'Usuario que hizo el último cambio (upload/update).';
COMMENT ON COLUMN public.eb_saldo_extracto.updated_by IS 'Usuario que hizo el último cambio del corte.';
COMMENT ON COLUMN public.imp_percepcion_mp.updated_by IS 'Usuario que hizo el último cambio.';
COMMENT ON COLUMN public.ef_estructura.created_by IS 'Usuario que creó el renglón.';
COMMENT ON COLUMN public.ef_estructura.updated_by IS 'Usuario que hizo el último cambio.';

CREATE OR REPLACE FUNCTION public.cb_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  -- cb_match no tiene created_by / updated_by; no tocarlo.
  IF TG_TABLE_NAME = 'cb_movimiento' THEN
    IF TG_OP = 'INSERT' AND NEW.created_by IS NULL THEN
      NEW.created_by = auth.uid();
    END IF;
    IF TG_OP = 'UPDATE' AND auth.uid() IS NOT NULL THEN
      NEW.updated_by = auth.uid();
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

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
  IF TG_OP = 'UPDATE' AND auth.uid() IS NOT NULL THEN
    NEW.updated_by = auth.uid();
  END IF;
  RETURN NEW;
END;
$$;

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
  IF TG_OP = 'UPDATE' AND auth.uid() IS NOT NULL THEN
    NEW.updated_by = auth.uid();
  END IF;
  RETURN NEW;
END;
$$;

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
  IF TG_OP = 'UPDATE' AND auth.uid() IS NOT NULL THEN
    NEW.updated_by = auth.uid();
  END IF;
  RETURN NEW;
END;
$$;

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
  IF auth.uid() IS NOT NULL THEN
    NEW.updated_by = auth.uid();
  ELSIF NEW.updated_by IS NULL THEN
    NEW.updated_by = NEW.created_by;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.ef_estructura_set_updated()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.created_by IS NULL THEN
    NEW.created_by = auth.uid();
  END IF;
  IF auth.uid() IS NOT NULL THEN
    NEW.updated_by = auth.uid();
  ELSIF NEW.updated_by IS NULL THEN
    NEW.updated_by = NEW.created_by;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ef_estructura_updated ON public.ef_estructura;
CREATE TRIGGER trg_ef_estructura_updated
  BEFORE INSERT OR UPDATE ON public.ef_estructura
  FOR EACH ROW EXECUTE FUNCTION public.ef_estructura_set_updated();

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
  tesoreria_descripcion text,
  created_by uuid,
  tesoreria_by uuid
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
    t.descripcion AS tesoreria_descripcion,
    p.created_by,
    p.tesoreria_by
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

DO $$
DECLARE
  v_uid uuid;
BEGIN
  SELECT p.id INTO v_uid
  FROM public.user_profiles p
  WHERE lower(p.email) = 'lucas.bustos.martin@gmail.com'
  LIMIT 1;
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'No se encontró el usuario lucas.bustos.martin@gmail.com';
  END IF;

  UPDATE public.user_profiles
  SET nombre_usuario = 'LB'
  WHERE id = v_uid
    AND COALESCE(nombre_usuario, '') IS DISTINCT FROM 'LB';

  UPDATE public.eb_saldo_extracto SET created_by = v_uid WHERE created_by IS NULL;
  UPDATE public.matriz_cat_cuenta_ef
  SET created_by = COALESCE(created_by, v_uid),
      updated_by = COALESCE(updated_by, created_by, v_uid)
  WHERE created_by IS NULL OR updated_by IS NULL;
  UPDATE public.ef_estructura
  SET created_by = COALESCE(created_by, v_uid),
      updated_by = COALESCE(updated_by, created_by, v_uid)
  WHERE created_by IS NULL OR updated_by IS NULL;
  UPDATE public.cb_movimiento SET created_by = v_uid WHERE created_by IS NULL;
  UPDATE public.cf_movimiento SET created_by = v_uid WHERE created_by IS NULL;
  UPDATE public.imp_percepcion_mp SET created_by = v_uid WHERE created_by IS NULL;
  UPDATE public.cb_match
  SET confirmado_by = v_uid
  WHERE estado = 'confirmado' AND confirmado_by IS NULL;
  UPDATE public.cb_dup_descartado SET descartado_by = v_uid WHERE descartado_by IS NULL;
  UPDATE public.cb_movimiento_eliminado SET eliminado_by = v_uid WHERE eliminado_by IS NULL;
  UPDATE public.cb_movimiento SET no_requiere_by = v_uid
  WHERE no_requiere_conciliacion AND no_requiere_by IS NULL;
END $$;
