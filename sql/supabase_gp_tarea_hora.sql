-- Fornitalia – Horas consumidas por fecha (conciliación diaria; no es alocación planificada).
-- Una fila = tarea + día de negocio (America/Argentina/Buenos_Aires) + horas.
-- Ejecutar después de sql/supabase_gestion_proyectos.sql.
-- Requiere public.fecha_hoy_argentina() (sql/helpers_fecha_argentina.sql).

CREATE TABLE IF NOT EXISTS public.gp_tarea_hora (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tarea_id uuid NOT NULL REFERENCES public.gp_tarea(id) ON DELETE CASCADE,
  fecha date NOT NULL DEFAULT public.fecha_hoy_argentina(),
  horas numeric(8,2) NOT NULL CHECK (horas > 0 AND horas <= 9999),
  observaciones text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  CONSTRAINT gp_tarea_hora_unica UNIQUE (tarea_id, fecha)
);

CREATE INDEX IF NOT EXISTS idx_gp_tarea_hora_tarea ON public.gp_tarea_hora (tarea_id, fecha);
CREATE INDEX IF NOT EXISTS idx_gp_tarea_hora_fecha ON public.gp_tarea_hora (fecha);

DROP TRIGGER IF EXISTS trg_gp_tarea_hora_updated ON public.gp_tarea_hora;
CREATE TRIGGER trg_gp_tarea_hora_updated
  BEFORE INSERT OR UPDATE ON public.gp_tarea_hora
  FOR EACH ROW EXECUTE FUNCTION public.gp_set_updated_at();

ALTER TABLE public.gp_tarea_hora ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS gp_tarea_hora_select ON public.gp_tarea_hora;
CREATE POLICY gp_tarea_hora_select ON public.gp_tarea_hora FOR SELECT TO authenticated
  USING (public.has_permission('ver_gestion_proyectos'));

DROP POLICY IF EXISTS gp_tarea_hora_insert ON public.gp_tarea_hora;
CREATE POLICY gp_tarea_hora_insert ON public.gp_tarea_hora FOR INSERT TO authenticated
  WITH CHECK (
    public.has_permission('crear_proyecto')
    OR public.has_permission('editar_proyecto')
  );

DROP POLICY IF EXISTS gp_tarea_hora_update ON public.gp_tarea_hora;
CREATE POLICY gp_tarea_hora_update ON public.gp_tarea_hora FOR UPDATE TO authenticated
  USING (public.has_permission('editar_proyecto'))
  WITH CHECK (public.has_permission('editar_proyecto'));

-- Al editar una tarea se reemplazan las filas de horas (delete + insert).
DROP POLICY IF EXISTS gp_tarea_hora_delete ON public.gp_tarea_hora;
CREATE POLICY gp_tarea_hora_delete ON public.gp_tarea_hora FOR DELETE TO authenticated
  USING (
    public.has_permission('editar_proyecto')
    OR public.has_permission('eliminar_proyecto')
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.gp_tarea_hora TO authenticated;

COMMENT ON TABLE public.gp_tarea_hora IS
  'Conciliación de horas consumidas (reales) por tarea y fecha de negocio (Argentina). No es alocación planificada. El total de la tarea/entregable es la suma de estas filas.';

COMMENT ON COLUMN public.gp_tarea.horas_alocadas IS
  'Legacy: total cache. La fuente de verdad es gp_tarea_hora (horas consumidas reales por fecha, no alocación planificada).';

-- Pasar el total suelto de gp_tarea.horas_alocadas a una fila en la fecha de inicio de la tarea.
INSERT INTO public.gp_tarea_hora (tarea_id, fecha, horas)
SELECT t.id, t.fecha_inicio, t.horas_alocadas
FROM public.gp_tarea t
WHERE t.horas_alocadas > 0
  AND NOT EXISTS (
    SELECT 1 FROM public.gp_tarea_hora h WHERE h.tarea_id = t.id
  )
ON CONFLICT (tarea_id, fecha) DO NOTHING;
