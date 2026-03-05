-- Demo para potencial cliente: datos ficticios (importes × 0.70)
-- 1) Crear tabla de respaldo con los datos reales (transacciones_fornitalia)
-- 2) Vaciar la tabla transacciones
-- 3) Volver a cargar transacciones desde el respaldo: monto = (monto × 0.70) redondeado hacia abajo según escala por magnitud (1.3→1, 103→100, 1567→1500, 25790→25000, 567829→560000, 1567900→1500000); monto_cambio no se modifica.
--
-- Ejecutar en Supabase SQL Editor en este orden. Revisar que no haya FKs que impidan TRUNCATE.

-- ========== PASO 1: Crear tabla de respaldo con datos reales ==========
DROP TABLE IF EXISTS public.transacciones_fornitalia;

CREATE TABLE public.transacciones_fornitalia (LIKE public.transacciones INCLUDING DEFAULTS);

-- Copiar índices que existan en transacciones (opcional, para consultas sobre el respaldo)
CREATE INDEX IF NOT EXISTS idx_transacciones_fornitalia_fecha ON public.transacciones_fornitalia (fecha);
CREATE INDEX IF NOT EXISTS idx_transacciones_fornitalia_anio_mes ON public.transacciones_fornitalia (anio, mes);

COMMENT ON TABLE public.transacciones_fornitalia IS 'Respaldo de datos reales antes de cargar demo con importes ficticios (mismo nombre + _fornitalia).';

INSERT INTO public.transacciones_fornitalia
SELECT * FROM public.transacciones;

-- Verificar conteo (opcional)
-- SELECT COUNT(*) AS respaldo FROM public.transacciones_fornitalia;
-- SELECT COUNT(*) AS actual FROM public.transacciones;

-- ========== PASO 2: Vaciar la tabla actual ==========
TRUNCATE TABLE public.transacciones;

-- Si TRUNCATE falla por restricciones, usar en su lugar:
-- DELETE FROM public.transacciones;

-- ========== PASO 3: Cargar tabla con importes ficticios (× 0.70 y redondeo por escala) ==========
-- Escala según magnitud del valor (tras × 0.70): <2→unidad, <100→decena, <1k→centena, <10k→500, <100k→5000, <1M→10k, >=1M→100k. Signo (egresos) se mantiene.
-- id y created_at se generan nuevos.

INSERT INTO public.transacciones (
  titulo, id_origen, id_cierre_caja, id_operacion, id_comprobante_pago, id_impuesto,
  cliente, tipo_movimiento, medio_pago, descripcion, cat_desc, observaciones,
  categoria, cuenta_contable, monto, tipo_cambio, monto_cambio,
  fecha, mes, mes_anio, anio, hora, usuario_app, status, creacion_manual, origen_archivo,
  moneda, editado, editado_detalle
)
SELECT
  titulo, id_origen, id_cierre_caja, id_operacion, id_comprobante_pago, id_impuesto,
  cliente, tipo_movimiento, medio_pago, descripcion, cat_desc, observaciones,
  categoria, cuenta_contable,
  (CASE WHEN (monto * 0.70) = 0 THEN 0
        WHEN (monto * 0.70) > 0 THEN
          CASE
            WHEN (monto * 0.70) < 2     THEN FLOOR((monto * 0.70) / 1) * 1
            WHEN (monto * 0.70) < 100   THEN FLOOR((monto * 0.70) / 10) * 10
            WHEN (monto * 0.70) < 1000  THEN FLOOR((monto * 0.70) / 100) * 100
            WHEN (monto * 0.70) < 10000 THEN FLOOR((monto * 0.70) / 500) * 500
            WHEN (monto * 0.70) < 100000 THEN FLOOR((monto * 0.70) / 5000) * 5000
            WHEN (monto * 0.70) < 1000000 THEN FLOOR((monto * 0.70) / 10000) * 10000
            ELSE FLOOR((monto * 0.70) / 100000) * 100000
          END
        ELSE
          - (CASE
              WHEN ABS(monto * 0.70) < 2     THEN FLOOR(ABS(monto * 0.70) / 1) * 1
              WHEN ABS(monto * 0.70) < 100   THEN FLOOR(ABS(monto * 0.70) / 10) * 10
              WHEN ABS(monto * 0.70) < 1000  THEN FLOOR(ABS(monto * 0.70) / 100) * 100
              WHEN ABS(monto * 0.70) < 10000 THEN FLOOR(ABS(monto * 0.70) / 500) * 500
              WHEN ABS(monto * 0.70) < 100000 THEN FLOOR(ABS(monto * 0.70) / 5000) * 5000
              WHEN ABS(monto * 0.70) < 1000000 THEN FLOOR(ABS(monto * 0.70) / 10000) * 10000
              ELSE FLOOR(ABS(monto * 0.70) / 100000) * 100000
            END)
   END) AS monto,
  tipo_cambio,
  monto_cambio,
  fecha, mes, mes_anio, anio, hora, usuario_app, status, creacion_manual, origen_archivo,
  moneda, editado, editado_detalle
FROM public.transacciones_fornitalia;

-- Verificar (opcional)
-- SELECT COUNT(*) FROM public.transacciones;
-- SELECT monto, (SELECT monto FROM transacciones_fornitalia t2 WHERE t2.id_origen = transacciones.id_origen LIMIT 1) AS monto_original FROM transacciones LIMIT 5;
