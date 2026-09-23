-- Cortes de Saldos extractos inflados por el histórico
-- (suma de todas las Apertura de Caja + movimientos).
-- Apertura no entra al corte; el histórico no pisa tesorería/cierre.
-- Se conservan Efectivo-s/f (sin aperturas) y el resto de canales.

DELETE FROM public.eb_saldo_extracto
WHERE canal IN ('galicia_facturada', 'morba_sf', 'galicia_dolar')
  AND (
    COALESCE(archivo, '') ILIKE '%movimientos-historico%'
    OR COALESCE(documento_id, '') ILIKE '%movimientos-historico%'
  );
