-- Quitar tesorería de la interfaz abierta (tesoreria_*.xlsx) cargada sin Id.
-- No toca extracto banco ni cierre de caja (CIERRE / raw.formato = cierre).
-- Las parejas en cb_match se borran explícitamente (incluye grupos N:M)
-- y el resto cae por ON DELETE CASCADE.

WITH tes AS (
  SELECT id
  FROM public.cb_movimiento
  WHERE origen = 'sistema'
    AND origen_id NOT LIKE 'id|%'
    AND origen_id NOT LIKE 'cierre|%'
    AND (
      archivo ILIKE '%tesoreria_%'
      OR COALESCE(raw->>'formato', '') = 'tesoreria'
    )
    AND COALESCE(raw->>'formato', '') <> 'cierre'
    AND COALESCE(archivo, '') NOT ILIKE '%CIERRE%'
)
DELETE FROM public.cb_match m
WHERE m.sistema_id IN (SELECT id FROM tes)
   OR m.banco_id IN (SELECT id FROM tes)
   OR COALESCE(m.sistema_ids, ARRAY[]::uuid[]) && ARRAY(SELECT id FROM tes)
   OR COALESCE(m.banco_ids, ARRAY[]::uuid[]) && ARRAY(SELECT id FROM tes);

DELETE FROM public.cb_movimiento
WHERE origen = 'sistema'
  AND origen_id NOT LIKE 'id|%'
  AND origen_id NOT LIKE 'cierre|%'
  AND (
    archivo ILIKE '%tesoreria_%'
    OR COALESCE(raw->>'formato', '') = 'tesoreria'
  )
  AND COALESCE(raw->>'formato', '') <> 'cierre'
  AND COALESCE(archivo, '') NOT ILIKE '%CIERRE%';
