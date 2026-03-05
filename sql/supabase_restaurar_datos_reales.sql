-- Restaurar la tabla transacciones con los datos reales guardados en transacciones_fornitalia
-- (después de haber mostrado la demo al cliente con datos ficticios).
-- Ejecutar en Supabase SQL Editor. Si hay FKs que impidan TRUNCATE, usar DELETE en su lugar.

-- ========== PASO 1: Vaciar la tabla transacciones ==========
TRUNCATE TABLE public.transacciones RESTART IDENTITY;

-- Si TRUNCATE falla por restricciones de clave foránea, usar en su lugar:
-- DELETE FROM public.transacciones;

-- ========== PASO 2: Copiar datos reales desde el respaldo ==========
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
  categoria, cuenta_contable, monto, tipo_cambio, monto_cambio,
  fecha, mes, mes_anio, anio, hora, usuario_app, status, creacion_manual, origen_archivo,
  moneda, editado, editado_detalle
FROM public.transacciones_fornitalia;

-- Verificar (opcional)
-- SELECT COUNT(*) AS registros_restaurados FROM public.transacciones;
