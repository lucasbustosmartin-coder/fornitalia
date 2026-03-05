-- Quitar políticas RLS "always true" (INSERT/UPDATE/DELETE) en tablas de solo lectura.
-- Ejecutar en Supabase SQL Editor.
-- Resuelve los WARN "RLS Policy Always True" para tipo_de_cambio, transacciones_respaldo, transacciones_fornitalia.
-- RLS sigue activo y SELECT sigue permitido; INSERT/UPDATE/DELETE por API se revocan.
-- Esas tablas se modifican desde el SQL Editor (backup, restore, carga de tipos de cambio), que no usa RLS.

-- ========== public.tipo_de_cambio ==========
-- El dashboard solo lee; la carga de datos se hace por SQL Editor o script con service_role.
DROP POLICY IF EXISTS "Permitir inserción tipo_de_cambio" ON public.tipo_de_cambio;
DROP POLICY IF EXISTS "Permitir actualización tipo_de_cambio" ON public.tipo_de_cambio;
DROP POLICY IF EXISTS "Permitir eliminación tipo_de_cambio" ON public.tipo_de_cambio;

-- ========== public.transacciones_respaldo ==========
DROP POLICY IF EXISTS "Permitir inserción transacciones_respaldo" ON public.transacciones_respaldo;
DROP POLICY IF EXISTS "Permitir actualización transacciones_respaldo" ON public.transacciones_respaldo;
DROP POLICY IF EXISTS "Permitir eliminación transacciones_respaldo" ON public.transacciones_respaldo;

-- ========== public.transacciones_fornitalia ==========
DROP POLICY IF EXISTS "Permitir inserción transacciones_fornitalia" ON public.transacciones_fornitalia;
DROP POLICY IF EXISTS "Permitir actualización transacciones_fornitalia" ON public.transacciones_fornitalia;
DROP POLICY IF EXISTS "Permitir eliminación transacciones_fornitalia" ON public.transacciones_fornitalia;

-- Nota: public.transacciones se deja con INSERT/UPDATE/DELETE permisivos porque el dashboard
-- y la migración los necesitan. Para quitar esos avisos habría que usar Supabase Auth y
-- restringir por auth.uid().
