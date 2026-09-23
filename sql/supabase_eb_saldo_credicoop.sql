-- Credicoop en Saldos extractos: no hay extractos históricos del banco.
-- El corte se arma con tesorería (cb_movimiento origen=sistema), sin Apertura de Caja.
-- Canal ya permitido en eb_guardar_saldos / eb_saldo_extracto.

WITH mov AS (
  SELECT
    id,
    fecha,
    COALESCE(credito, 0) - ABS(COALESCE(debito, 0)) AS neto,
    archivo
  FROM public.cb_movimiento
  WHERE canal = 'credicoop'
    AND origen = 'sistema'
    AND COALESCE(pendiente_baja, false) = false
    AND COALESCE(tipo, '') NOT ILIKE '%apertura de caja%'
),
ord AS (
  SELECT
    id,
    fecha,
    archivo,
    neto,
    SUM(neto) OVER (ORDER BY fecha, id) AS saldo_run
  FROM mov
),
mes AS (
  SELECT
    (date_trunc('month', fecha))::date AS mes,
    MIN(fecha) AS fecha_desde,
    MAX(fecha) AS fecha_hasta,
    (ARRAY_AGG(saldo_run ORDER BY fecha DESC, id DESC))[1] AS saldo_final,
    (ARRAY_AGG(archivo ORDER BY fecha DESC, id DESC))[1] AS archivo
  FROM ord
  GROUP BY 1
),
serie AS (
  SELECT
    fecha_desde,
    fecha_hasta,
    saldo_final,
    archivo,
    LAG(saldo_final) OVER (ORDER BY fecha_hasta) AS saldo_prev
  FROM mes
)
INSERT INTO public.eb_saldo_extracto (
  canal, moneda, nro_cuenta, tipo_cuenta,
  fecha_desde, fecha_hasta, saldo_inicial, saldo_final,
  documento_id, archivo, raw
)
SELECT
  'credicoop',
  'ARS',
  'credicoop',
  'Credicoop',
  fecha_desde,
  fecha_hasta,
  ROUND(COALESCE(saldo_prev, 0)::numeric, 2),
  ROUND(saldo_final::numeric, 2),
  'credicoop-tesoreria',
  archivo,
  jsonb_build_object(
    'formato', 'tesoreria',
    'sin_apertura', true,
    'origen', 'seed_movimientos'
  )
FROM serie
ON CONFLICT (canal, nro_cuenta, fecha_hasta) DO UPDATE SET
  moneda = EXCLUDED.moneda,
  tipo_cuenta = EXCLUDED.tipo_cuenta,
  fecha_desde = EXCLUDED.fecha_desde,
  saldo_inicial = EXCLUDED.saldo_inicial,
  saldo_final = EXCLUDED.saldo_final,
  documento_id = EXCLUDED.documento_id,
  archivo = EXCLUDED.archivo,
  raw = EXCLUDED.raw;
