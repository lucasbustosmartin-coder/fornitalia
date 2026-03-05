-- Backup de la tabla transacciones antes de volver a cargar (ej. Caja_Enero).
-- Ejecutar en Supabase SQL Editor ANTES de correr: python migrate_caja_to_supabase.py --solo-caja-enero
-- Si ya existía un respaldo con este nombre, se reemplaza.

DROP TABLE IF EXISTS public.transacciones_respaldo;

CREATE TABLE public.transacciones_respaldo AS
SELECT * FROM public.transacciones;

COMMENT ON TABLE public.transacciones_respaldo IS 'Respaldo de transacciones antes de migración. Para restaurar: ver instrucciones al final de este archivo o en supabase_restaurar_datos_reales.sql (adaptar nombre de tabla origen).';

-- Para ver cuántos registros se respaldaron:
-- SELECT COUNT(*) FROM public.transacciones_respaldo;

-- Para restaurar desde este respaldo (si algo salió mal):
-- 1) Vaciar transacciones: TRUNCATE TABLE public.transacciones RESTART IDENTITY;
-- 2) INSERT INTO public.transacciones SELECT * FROM public.transacciones_respaldo;
