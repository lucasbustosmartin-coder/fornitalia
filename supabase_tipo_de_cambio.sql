-- Tabla: tipo_de_cambio
-- Migración desde tipos_cambio_global_rows.csv
-- Ejecutar en Supabase SQL Editor

CREATE TABLE IF NOT EXISTS public.tipo_de_cambio (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fecha date NOT NULL,
  usd_mep numeric,
  usd_ccl numeric,
  usd_oficial numeric,
  creado_en timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tipo_de_cambio_fecha ON public.tipo_de_cambio (fecha);

COMMENT ON TABLE public.tipo_de_cambio IS 'Tipos de cambio USD (MEP, CCL, oficial) por fecha.';
