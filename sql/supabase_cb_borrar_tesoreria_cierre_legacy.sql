-- Quitar tesorería cargada con el Excel de cajas cerradas (sin Id estable).
-- Archivos CIERRE / raw.formato = cierre. Las parejas en cb_match se borran
-- explícitamente (incluye grupos N:M) y el resto cae por ON DELETE CASCADE.

WITH cierre AS (
  SELECT id
  FROM public.cb_movimiento
  WHERE origen = 'sistema'
    AND (
      archivo ILIKE '%CIERRE%'
      OR COALESCE(raw->>'formato', '') = 'cierre'
    )
)
DELETE FROM public.cb_match m
WHERE m.sistema_id IN (SELECT id FROM cierre)
   OR m.banco_id IN (SELECT id FROM cierre)
   OR COALESCE(m.sistema_ids, ARRAY[]::uuid[]) && ARRAY(SELECT id FROM cierre)
   OR COALESCE(m.banco_ids, ARRAY[]::uuid[]) && ARRAY(SELECT id FROM cierre);

DELETE FROM public.cb_movimiento
WHERE origen = 'sistema'
  AND (
    archivo ILIKE '%CIERRE%'
    OR COALESCE(raw->>'formato', '') = 'cierre'
  );
