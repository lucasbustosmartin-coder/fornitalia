-- Tesorería (origen=sistema) con fecha de negocio < 01/09/2026.
-- Ambas interfaces (tesoreria_*.xlsx y cierre). No toca extracto banco.
-- Parejas (confirmadas, sugeridas, rechazadas, grupos N:M) se borran primero.

WITH tes AS (
  SELECT id
  FROM public.cb_movimiento
  WHERE origen = 'sistema'
    AND fecha < DATE '2026-09-01'
)
DELETE FROM public.cb_match m
WHERE m.sistema_id IN (SELECT id FROM tes)
   OR m.banco_id IN (SELECT id FROM tes)
   OR COALESCE(m.sistema_ids, ARRAY[]::uuid[]) && ARRAY(SELECT id FROM tes)
   OR COALESCE(m.banco_ids, ARRAY[]::uuid[]) && ARRAY(SELECT id FROM tes);

DELETE FROM public.cb_movimiento
WHERE origen = 'sistema'
  AND fecha < DATE '2026-09-01';
