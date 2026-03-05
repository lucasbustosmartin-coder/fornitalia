-- Vaciar la tabla transacciones antes de volver a cargar desde los Excel (carpeta Caja).
-- Ejecutar en Supabase SQL Editor. Luego ejecutar: python migrate_caja_to_supabase.py

TRUNCATE TABLE public.transacciones RESTART IDENTITY;

-- Si TRUNCATE falla por restricciones de clave foránea, usar en su lugar:
-- DELETE FROM public.transacciones;
