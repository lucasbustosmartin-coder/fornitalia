-- Fornitalia – día de negocio en America/Argentina/Buenos_Aires
-- Usar en DEFAULT de columnas date y en RPCs. No usar CURRENT_DATE como “hoy” contable.

CREATE OR REPLACE FUNCTION public.fecha_hoy_argentina()
RETURNS date
LANGUAGE sql
STABLE
AS $$
  SELECT (timezone('America/Argentina/Buenos_Aires', now()))::date;
$$;

COMMENT ON FUNCTION public.fecha_hoy_argentina() IS
  'Día calendario de negocio (Argentina). No depende del TimeZone de la sesión.';

GRANT EXECUTE ON FUNCTION public.fecha_hoy_argentina() TO authenticated;
GRANT EXECUTE ON FUNCTION public.fecha_hoy_argentina() TO anon;
GRANT EXECUTE ON FUNCTION public.fecha_hoy_argentina() TO service_role;
