-- Horas alocadas por tarea; el entregable totaliza la suma (en la app, sin columna denormalizada).
-- Ejecutar después de sql/supabase_gestion_proyectos.sql.

ALTER TABLE public.gp_tarea
  ADD COLUMN IF NOT EXISTS horas_alocadas numeric(8,2) NOT NULL DEFAULT 0
    CHECK (horas_alocadas >= 0);

COMMENT ON COLUMN public.gp_tarea.horas_alocadas IS
  'Horas demandadas/alocadas a la tarea. El entregable muestra la suma de tareas no canceladas.';
