-- Soporte para cargas controladas del extracto normalizado desde la app.
-- Ejecutar en Supabase SQL Editor.

-- 1) Log de ejecuciones de importación
CREATE TABLE IF NOT EXISTS public.log_actualizacion_transacciones (
  id bigserial PRIMARY KEY,
  at timestamptz NOT NULL DEFAULT now(),
  filas_insertadas integer NOT NULL DEFAULT 0,
  archivo text,
  detalle text
);

COMMENT ON TABLE public.log_actualizacion_transacciones IS 'Auditoría de cargas del extracto normalizado realizadas desde la app.';

-- 2) Índice para ver últimas ejecuciones rápidamente
CREATE INDEX IF NOT EXISTS idx_log_actualizacion_transacciones_at
  ON public.log_actualizacion_transacciones (at DESC);

-- 3) Función RPC opcional para registrar la ejecución al finalizar una carga
CREATE OR REPLACE FUNCTION public.log_upload_normalizado(
  p_filas_insertadas integer,
  p_archivo text DEFAULT NULL,
  p_detalle text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO public.log_actualizacion_transacciones (filas_insertadas, archivo, detalle)
  VALUES (COALESCE(p_filas_insertadas, 0), p_archivo, p_detalle);
END;
$$;

GRANT EXECUTE ON FUNCTION public.log_upload_normalizado(integer, text, text) TO anon, authenticated;

-- 4) (Opcional) Activar RLS y permitir solo lectura del log.
ALTER TABLE public.log_actualizacion_transacciones ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'log_actualizacion_transacciones'
      AND policyname = 'Permitir lectura log_actualizacion_transacciones'
  ) THEN
    CREATE POLICY "Permitir lectura log_actualizacion_transacciones"
      ON public.log_actualizacion_transacciones
      FOR SELECT
      USING (true);
  END IF;
END $$;

-- 5) Log de filas excluidas durante upload (errores + reglas de exclusión)
CREATE TABLE IF NOT EXISTS public.transacciones_upload_excluidos (
  id bigserial PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now(),
  run_ref text,
  archivo text,
  fila_excel integer,
  motivo text,
  tipo_movimiento text,
  moneda text,
  monto numeric,
  descripcion text,
  raw_payload jsonb
);

COMMENT ON TABLE public.transacciones_upload_excluidos IS 'Filas del extracto normalizado que se excluyen del upload por validación o regla de negocio.';

CREATE INDEX IF NOT EXISTS idx_transacciones_upload_excluidos_created_at
  ON public.transacciones_upload_excluidos (created_at DESC);

ALTER TABLE public.transacciones_upload_excluidos ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'transacciones_upload_excluidos'
      AND policyname = 'Permitir lectura transacciones_upload_excluidos'
  ) THEN
    CREATE POLICY "Permitir lectura transacciones_upload_excluidos"
      ON public.transacciones_upload_excluidos
      FOR SELECT
      USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'transacciones_upload_excluidos'
      AND policyname = 'Permitir insercion transacciones_upload_excluidos'
  ) THEN
    CREATE POLICY "Permitir insercion transacciones_upload_excluidos"
      ON public.transacciones_upload_excluidos
      FOR INSERT
      WITH CHECK (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'transacciones_upload_excluidos'
      AND policyname = 'Permitir eliminacion transacciones_upload_excluidos'
  ) THEN
    CREATE POLICY "Permitir eliminacion transacciones_upload_excluidos"
      ON public.transacciones_upload_excluidos
      FOR DELETE
      USING (true);
  END IF;
END $$;
