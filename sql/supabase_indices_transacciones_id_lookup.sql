-- Índices opcionales para cruces por IDs del export Fornitalia_Movimientos (Supabase SQL Editor).
-- Ejecutar solo si vas a filtrar/unir frecuentemente por estos campos.

CREATE INDEX IF NOT EXISTS idx_transacciones_id_comprobante_pago
  ON public.transacciones (id_comprobante_pago)
  WHERE id_comprobante_pago IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_transacciones_id_impuesto
  ON public.transacciones (id_impuesto)
  WHERE id_impuesto IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_transacciones_id_cierre_caja
  ON public.transacciones (id_cierre_caja)
  WHERE id_cierre_caja IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_transacciones_id_operacion
  ON public.transacciones (id_operacion)
  WHERE id_operacion IS NOT NULL;
