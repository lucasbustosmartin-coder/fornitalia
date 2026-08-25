-- Fornitalia – Horas consumidas propias del entregable (por fecha).
-- Permite cargar horas sin tareas. El total del entregable = propias + horas de sus tareas.
-- Ejecutar después de sql/supabase_gestion_proyectos.sql.
-- Requiere public.fecha_hoy_argentina() (sql/helpers_fecha_argentina.sql).

CREATE TABLE IF NOT EXISTS public.gp_entregable_hora (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entregable_id uuid NOT NULL REFERENCES public.gp_entregable(id) ON DELETE CASCADE,
  fecha date NOT NULL DEFAULT public.fecha_hoy_argentina(),
  horas numeric(8,2) NOT NULL CHECK (horas > 0 AND horas <= 9999),
  observaciones text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  CONSTRAINT gp_entregable_hora_unica UNIQUE (entregable_id, fecha)
);

CREATE INDEX IF NOT EXISTS idx_gp_entregable_hora_ent ON public.gp_entregable_hora (entregable_id, fecha);
CREATE INDEX IF NOT EXISTS idx_gp_entregable_hora_fecha ON public.gp_entregable_hora (fecha);

DROP TRIGGER IF EXISTS trg_gp_entregable_hora_updated ON public.gp_entregable_hora;
CREATE TRIGGER trg_gp_entregable_hora_updated
  BEFORE INSERT OR UPDATE ON public.gp_entregable_hora
  FOR EACH ROW EXECUTE FUNCTION public.gp_set_updated_at();

ALTER TABLE public.gp_entregable_hora ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS gp_entregable_hora_select ON public.gp_entregable_hora;
CREATE POLICY gp_entregable_hora_select ON public.gp_entregable_hora FOR SELECT TO authenticated
  USING (public.has_permission('ver_gestion_proyectos'));

DROP POLICY IF EXISTS gp_entregable_hora_insert ON public.gp_entregable_hora;
CREATE POLICY gp_entregable_hora_insert ON public.gp_entregable_hora FOR INSERT TO authenticated
  WITH CHECK (
    public.has_permission('crear_proyecto')
    OR public.has_permission('editar_proyecto')
  );

DROP POLICY IF EXISTS gp_entregable_hora_update ON public.gp_entregable_hora;
CREATE POLICY gp_entregable_hora_update ON public.gp_entregable_hora FOR UPDATE TO authenticated
  USING (public.has_permission('editar_proyecto'))
  WITH CHECK (public.has_permission('editar_proyecto'));

DROP POLICY IF EXISTS gp_entregable_hora_delete ON public.gp_entregable_hora;
CREATE POLICY gp_entregable_hora_delete ON public.gp_entregable_hora FOR DELETE TO authenticated
  USING (
    public.has_permission('editar_proyecto')
    OR public.has_permission('eliminar_proyecto')
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.gp_entregable_hora TO authenticated;

COMMENT ON TABLE public.gp_entregable_hora IS
  'Horas consumidas propias del entregable por fecha (Argentina). El total del entregable es estas filas más gp_tarea_hora de sus tareas.';
