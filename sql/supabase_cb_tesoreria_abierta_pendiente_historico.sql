-- Baja (A eliminar): Status Pendiente o Status vacío = caja abierta.
-- Da igual si el Id entró por tesoreria_*.xlsx o por el histórico: se puede
-- anular en el sistema y desaparecer. Confirmado nunca va a A eliminar.

CREATE OR REPLACE FUNCTION public.cb_es_tesoreria_abierta(p_mov public.cb_movimiento)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT p_mov.origen = 'sistema'
    AND p_mov.origen_id LIKE 'id|%'
    AND COALESCE(p_mov.raw->>'formato', '') <> 'cierre'
    AND COALESCE(p_mov.archivo, '') NOT ILIKE '%CIERRE%'
    AND lower(btrim(COALESCE(p_mov.raw->>'status', p_mov.raw->>'Status', ''))) IN ('pendiente', '');
$$;

CREATE OR REPLACE FUNCTION public.cf_es_tesoreria_abierta(p_mov public.cf_movimiento)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT p_mov.origen_id LIKE 'id|%'
    AND COALESCE(p_mov.raw->>'formato', '') <> 'cierre'
    AND COALESCE(p_mov.archivo, '') NOT ILIKE '%cierre%'
    AND lower(btrim(COALESCE(p_mov.raw->>'status', p_mov.raw->>'Status', ''))) IN ('pendiente', '');
$$;

COMMENT ON FUNCTION public.cb_es_tesoreria_abierta(public.cb_movimiento) IS
  'Caja abierta = Status Pendiente o vacío (tesorería o histórico). Confirmado y cierre no.';
COMMENT ON FUNCTION public.cf_es_tesoreria_abierta(public.cf_movimiento) IS
  'Caja abierta = Status Pendiente o vacío (tesorería o histórico). Confirmado y cierre no.';
