-- Demo para potencial cliente: datos ficticios (importes × 0.70)
-- 1) Crear tabla de respaldo con los datos reales (transacciones_fornitalia)
-- 2) Vaciar la tabla transacciones
-- 3) Volver a cargar transacciones desde el respaldo aplicando solo monto * 0.70 (monto_cambio no se modifica)
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

-- ========== PASO 3: Cargar tabla con importes ficticios (× 0.70) ==========
-- Se reinsertan todos los registros desde el respaldo; solo monto se multiplica por 0.70; monto_cambio se copia tal cual.
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
  monto * 0.70 AS monto,
  tipo_cambio,
  monto_cambio,
  fecha, mes, mes_anio, anio, hora, usuario_app, status, creacion_manual, origen_archivo,
  moneda, editado, editado_detalle
FROM public.transacciones_fornitalia;

-- Verificar (opcional)
-- SELECT COUNT(*) FROM public.transacciones;
-- SELECT monto, (SELECT monto FROM transacciones_fornitalia t2 WHERE t2.id_origen = transacciones.id_origen LIMIT 1) AS monto_original FROM transacciones LIMIT 5;
