-- Tabla: transacciones
-- Migración desde Excel de reportes de Caja (Fornitalia)
-- Ejecutar en Supabase SQL Editor

CREATE TABLE IF NOT EXISTS public.transacciones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  titulo text,
  id_origen bigint,
  id_cierre_caja text,
  id_operacion text,
  id_comprobante_pago numeric,
  id_impuesto numeric,
  cliente text,
  tipo_movimiento text,
  medio_pago text,
  descripcion text,
  cat_desc text,
  observaciones text,
  categoria text,
  cuenta_contable text,
  monto numeric,
  tipo_cambio numeric,
  monto_cambio numeric,
  fecha date,
  mes smallint,
  mes_anio date,
  anio smallint,
  hora time,
  usuario_app text,
  status text,
  creacion_manual text,
  origen_archivo text,
  created_at timestamptz DEFAULT now()
);

-- Índices útiles para consultas
CREATE INDEX IF NOT EXISTS idx_transacciones_fecha ON public.transacciones (fecha);
CREATE INDEX IF NOT EXISTS idx_transacciones_medio_pago ON public.transacciones (medio_pago);
CREATE INDEX IF NOT EXISTS idx_transacciones_tipo_movimiento ON public.transacciones (tipo_movimiento);
CREATE INDEX IF NOT EXISTS idx_transacciones_anio_mes ON public.transacciones (anio, mes);
CREATE INDEX IF NOT EXISTS idx_transacciones_origen_archivo ON public.transacciones (origen_archivo);

COMMENT ON TABLE public.transacciones IS 'Transacciones de caja migradas desde Excel (reportes 2025).';
