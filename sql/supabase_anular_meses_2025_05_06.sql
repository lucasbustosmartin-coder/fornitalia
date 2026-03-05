-- Anular todas las transacciones de mayo 2025 y junio 2025
-- Ejecutar en Supabase SQL Editor (revisar cantidad de filas antes de confirmar)

-- Opcional: ver cuántas filas se van a actualizar
-- SELECT COUNT(*) FROM public.transacciones WHERE (anio = 2025 AND mes = 5) OR (anio = 2025 AND mes = 6);

UPDATE public.transacciones
SET status = 'Anulado'
WHERE (anio = 2025 AND mes = 5)
   OR (anio = 2025 AND mes = 6);

-- Ver resultado (opcional)
-- SELECT anio, mes, status, COUNT(*) FROM public.transacciones WHERE anio = 2025 AND mes IN (5, 6) GROUP BY anio, mes, status;
