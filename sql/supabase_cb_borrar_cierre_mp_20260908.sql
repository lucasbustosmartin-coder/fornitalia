-- Quitar la carga de tesorería del cierre MP (MP_CIERRE-08092026-164141-0BD1.xlsx).
-- Las parejas (cb_match) caen por ON DELETE CASCADE.

DELETE FROM public.cb_movimiento
WHERE archivo = 'MP_CIERRE-08092026-164141-0BD1.xlsx'
  AND origen = 'sistema'
  AND canal = 'mercadopago';
