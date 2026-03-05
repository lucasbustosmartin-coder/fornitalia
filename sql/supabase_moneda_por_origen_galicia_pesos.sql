-- Si el archivo de origen es REPORTE CAJAS TRANSFERENCIA GALICIA PESOS 2025.xlsx, la moneda es ARS.
-- Ejecutar en Supabase SQL Editor.

UPDATE public.transacciones
SET moneda = 'ARS'
WHERE origen_archivo = 'REPORTE CAJAS TRANSFERENCIA GALICIA PESOS 2025.xlsx';

-- Verificar (opcional): cantidad de filas actualizadas
-- SELECT COUNT(*) FROM public.transacciones WHERE origen_archivo = 'REPORTE CAJAS TRANSFERENCIA GALICIA PESOS 2025.xlsx' AND moneda = 'ARS';
