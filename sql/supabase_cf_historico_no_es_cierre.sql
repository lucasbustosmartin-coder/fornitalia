-- El histórico movimientos-historico trae columna Monto (como un cierre).
-- En cajas físicas eso lo dejaba grabado como formato cierre y A eliminar
-- no lo miraba. Un Pendiente de ese archivo sí puede desaparecer.
-- Confirmado y un Excel de cierre (cierre_…) siguen afuera.

CREATE OR REPLACE FUNCTION public.cf_es_tesoreria_abierta(p_mov public.cf_movimiento)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT p_mov.origen_id LIKE 'id|%'
    AND NOT (
      COALESCE(p_mov.raw->>'formato', '') = 'cierre'
      AND COALESCE(p_mov.archivo, '') !~* 'historico'
    )
    AND (
      COALESCE(p_mov.archivo, '') !~* 'cierre'
      OR COALESCE(p_mov.archivo, '') ~* 'historico'
    )
    AND lower(btrim(COALESCE(p_mov.raw->>'status', p_mov.raw->>'Status', ''))) IN ('pendiente', '');
$$;

COMMENT ON FUNCTION public.cf_es_tesoreria_abierta(public.cf_movimiento) IS
  'Caja abierta = Status Pendiente o vacío (tesorería o histórico). Un movimientos-historico no es cierre aunque el Excel traiga columna Monto. Confirmado y un archivo de cierre no.';

UPDATE public.cf_movimiento
SET raw = jsonb_set(COALESCE(raw, '{}'::jsonb), '{formato}', '"historico"', true)
WHERE COALESCE(raw->>'formato', '') = 'cierre'
  AND COALESCE(archivo, '') ~* 'historico';
