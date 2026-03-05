-- Eliminar solo los registros que se cargaron en NULL (vuelco fallido desde Caja_Enero / CIERRE DE CAJA).
-- Ejecutar en Supabase SQL Editor ANTES de volver a correr: python migrate_caja_to_supabase.py --solo-caja-enero
-- No borra el resto de transacciones (las que ya tenés bien cargadas desde Caja).

DELETE FROM public.transacciones
WHERE origen_archivo LIKE '%CIERRE DE CAJA%'
  AND titulo IS NULL
  AND id_origen IS NULL;

-- Opcional: ver cuántos se borraron (ejecutar antes del DELETE para revisar)
-- SELECT COUNT(*) FROM public.transacciones
-- WHERE origen_archivo LIKE '%CIERRE DE CAJA%' AND titulo IS NULL AND id_origen IS NULL;
