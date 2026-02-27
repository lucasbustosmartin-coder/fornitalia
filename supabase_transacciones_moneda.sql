-- Migración: agregar campo moneda a transacciones (normalización)
-- Ejecutar en Supabase SQL Editor después de supabase_transacciones.sql
-- Valores esperados: 'ARS' | 'USD'

ALTER TABLE public.transacciones
  ADD COLUMN IF NOT EXISTS moneda text;

COMMENT ON COLUMN public.transacciones.moneda IS 'Moneda de registración del monto: ARS o USD. Si está vacío, el dashboard infiere desde medio_pago (ej. si contiene "dolar" → USD).';

-- Opcional: rellenar moneda para registros existentes según medio_pago
-- Descomentar y ejecutar si querés normalizar datos ya cargados:
/*
UPDATE public.transacciones
SET moneda = CASE
  WHEN (medio_pago IS NOT NULL AND lower(medio_pago) LIKE '%dolar%') THEN 'USD'
  ELSE 'ARS'
END
WHERE moneda IS NULL;
*/
