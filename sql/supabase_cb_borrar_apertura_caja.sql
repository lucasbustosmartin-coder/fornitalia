-- Quitar Apertura de Caja de conciliación (tesorería). No se vuelve a cargar en el upload.
-- Las parejas (cb_match) caen por ON DELETE CASCADE si hubiera alguna.

DELETE FROM public.cb_movimiento
WHERE tipo ILIKE '%apertura de caja%'
   OR descripcion ILIKE '%apertura de caja%';
