-- Meses excluidos del tablero agregado (config por usuario).
-- Ejecutar en Supabase SQL Editor si ya tenés la tabla config_dashboard.

ALTER TABLE public.config_dashboard
  ADD COLUMN IF NOT EXISTS meses_excluidos jsonb NOT NULL DEFAULT '["2026-03"]'::jsonb;

COMMENT ON COLUMN public.config_dashboard.meses_excluidos IS
  'Array JSON de claves YYYY-MM excluidas de flujo operativo, totales, Evolución y Caución. [] = ningún mes excluido. Por defecto marzo 2026 hasta reconfigurar.';
