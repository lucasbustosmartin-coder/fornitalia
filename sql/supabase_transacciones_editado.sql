-- Migración: campos de control de edición manual (Fornitalia)
-- Ejecutar en Supabase SQL Editor

ALTER TABLE public.transacciones
  ADD COLUMN IF NOT EXISTS editado boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS editado_detalle text;

COMMENT ON COLUMN public.transacciones.editado IS 'True si el registro fue corregido manualmente desde el modal de errores.';
COMMENT ON COLUMN public.transacciones.editado_detalle IS 'Indica qué campos se editaron: ej. "Categoria, Descripcion, Cuenta Contable" o "Descripcion".';
