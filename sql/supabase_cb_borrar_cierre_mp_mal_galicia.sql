-- Quitar tesorería mal cargada en Galicia: era un cierre MP (MP_CIERRE-03082026-204514-5AAE.xlsx).
-- Las parejas (cb_match) caen por ON DELETE CASCADE.

DELETE FROM public.cb_movimiento
WHERE archivo = 'MP_CIERRE-03082026-204514-5AAE.xlsx'
  AND origen = 'sistema'
  AND canal = 'galicia';
