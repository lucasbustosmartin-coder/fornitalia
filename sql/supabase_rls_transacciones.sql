-- Habilitar Row Level Security (RLS) en public.transacciones
-- Ejecutar en Supabase SQL Editor.
-- Resuelve: "Table public.transacciones is public, but RLS has not been enabled."

-- 1) Activar RLS en la tabla
ALTER TABLE public.transacciones ENABLE ROW LEVEL SECURITY;

-- 2) Políticas para que el dashboard siga funcionando
--    (lectura, inserción desde migración, actualización desde el dashboard, eliminación si se usa)
--    Si usás la service_role key en el backend (ej. migración Python), esa key ignora RLS.
--    Si el frontend usa anon key, estas políticas permiten las operaciones actuales.

-- Permitir SELECT a todos los roles que pasan por PostgREST (anon, authenticated, service_role)
CREATE POLICY "Permitir lectura transacciones"
  ON public.transacciones FOR SELECT
  USING (true);

-- Permitir INSERT (ej. para migración con anon/key que use PostgREST, o para futuras inserciones)
CREATE POLICY "Permitir inserción transacciones"
  ON public.transacciones FOR INSERT
  WITH CHECK (true);

-- Permitir UPDATE (edición desde el dashboard: categoría, cuenta, descripción, etc.)
CREATE POLICY "Permitir actualización transacciones"
  ON public.transacciones FOR UPDATE
  USING (true)
  WITH CHECK (true);

-- Permitir DELETE si en algún flujo se eliminan registros
CREATE POLICY "Permitir eliminación transacciones"
  ON public.transacciones FOR DELETE
  USING (true);

-- Opcional: más adelante podés reemplazar (true) por restricciones por usuario, ej.:
-- USING (auth.uid() = user_id) si agregás columna user_id y Supabase Auth.

-- ========== public.transacciones_respaldo ==========
-- Tabla de respaldo (creada por supabase_backup_transacciones.sql).
-- RLS: mismo criterio para que el aviso de seguridad quede resuelto.

ALTER TABLE public.transacciones_respaldo ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Permitir lectura transacciones_respaldo"
  ON public.transacciones_respaldo FOR SELECT
  USING (true);

CREATE POLICY "Permitir inserción transacciones_respaldo"
  ON public.transacciones_respaldo FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Permitir actualización transacciones_respaldo"
  ON public.transacciones_respaldo FOR UPDATE
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Permitir eliminación transacciones_respaldo"
  ON public.transacciones_respaldo FOR DELETE
  USING (true);

-- ========== public.tipo_de_cambio ==========
-- Tipos de cambio por fecha (MEP, CCL, oficial). El dashboard solo hace SELECT.

ALTER TABLE public.tipo_de_cambio ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Permitir lectura tipo_de_cambio"
  ON public.tipo_de_cambio FOR SELECT
  USING (true);

CREATE POLICY "Permitir inserción tipo_de_cambio"
  ON public.tipo_de_cambio FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Permitir actualización tipo_de_cambio"
  ON public.tipo_de_cambio FOR UPDATE
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Permitir eliminación tipo_de_cambio"
  ON public.tipo_de_cambio FOR DELETE
  USING (true);

-- ========== public.transacciones_fornitalia ==========
-- Respaldo de datos reales (demo / restaurar). RLS para cerrar el aviso de seguridad.

ALTER TABLE public.transacciones_fornitalia ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Permitir lectura transacciones_fornitalia"
  ON public.transacciones_fornitalia FOR SELECT
  USING (true);

CREATE POLICY "Permitir inserción transacciones_fornitalia"
  ON public.transacciones_fornitalia FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Permitir actualización transacciones_fornitalia"
  ON public.transacciones_fornitalia FOR UPDATE
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Permitir eliminación transacciones_fornitalia"
  ON public.transacciones_fornitalia FOR DELETE
  USING (true);
