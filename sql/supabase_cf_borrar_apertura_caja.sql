-- Quitar Apertura de Caja de cajas físicas. No se vuelve a cargar en el upload.
-- El monto de apertura, si viene en el Excel, solo se usa para el corte de Saldos extractos.

DELETE FROM public.cf_movimiento
WHERE tipo ILIKE '%apertura de caja%'
   OR descripcion ILIKE '%apertura de caja%';
