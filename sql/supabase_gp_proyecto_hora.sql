-- Fornitalia – Horas consumidas propias del proyecto (por fecha).
-- Mismos datos que entregable/tarea: fecha (Argentina) + horas + observaciones.
-- El total del proyecto = propias + horas de entregables + horas de tareas.
-- Ejecutar después de sql/supabase_gp_hora_observaciones.sql.
-- Requiere public.fecha_hoy_argentina() (sql/helpers_fecha_argentina.sql).

CREATE TABLE IF NOT EXISTS public.gp_proyecto_hora (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  proyecto_id uuid NOT NULL REFERENCES public.gp_proyecto(id) ON DELETE CASCADE,
  fecha date NOT NULL DEFAULT public.fecha_hoy_argentina(),
  horas numeric(8,2) NOT NULL CHECK (horas > 0 AND horas <= 9999),
  observaciones text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  CONSTRAINT gp_proyecto_hora_unica UNIQUE (proyecto_id, fecha)
);

CREATE INDEX IF NOT EXISTS idx_gp_proyecto_hora_proy ON public.gp_proyecto_hora (proyecto_id, fecha);
CREATE INDEX IF NOT EXISTS idx_gp_proyecto_hora_fecha ON public.gp_proyecto_hora (fecha);

DROP TRIGGER IF EXISTS trg_gp_proyecto_hora_updated ON public.gp_proyecto_hora;
CREATE TRIGGER trg_gp_proyecto_hora_updated
  BEFORE INSERT OR UPDATE ON public.gp_proyecto_hora
  FOR EACH ROW EXECUTE FUNCTION public.gp_set_updated_at();

ALTER TABLE public.gp_proyecto_hora ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.gp_proyecto_hora FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.gp_proyecto_hora TO authenticated;

DROP POLICY IF EXISTS gp_proyecto_hora_select ON public.gp_proyecto_hora;
CREATE POLICY gp_proyecto_hora_select ON public.gp_proyecto_hora FOR SELECT TO authenticated
  USING (public.has_permission('ver_gestion_proyectos'));

DROP POLICY IF EXISTS gp_proyecto_hora_insert ON public.gp_proyecto_hora;
CREATE POLICY gp_proyecto_hora_insert ON public.gp_proyecto_hora FOR INSERT TO authenticated
  WITH CHECK (
    public.has_permission('crear_proyecto')
    OR public.has_permission('editar_proyecto')
  );

DROP POLICY IF EXISTS gp_proyecto_hora_update ON public.gp_proyecto_hora;
CREATE POLICY gp_proyecto_hora_update ON public.gp_proyecto_hora FOR UPDATE TO authenticated
  USING (public.has_permission('editar_proyecto'))
  WITH CHECK (public.has_permission('editar_proyecto'));

DROP POLICY IF EXISTS gp_proyecto_hora_delete ON public.gp_proyecto_hora;
CREATE POLICY gp_proyecto_hora_delete ON public.gp_proyecto_hora FOR DELETE TO authenticated
  USING (
    public.has_permission('editar_proyecto')
    OR public.has_permission('eliminar_proyecto')
  );

CREATE OR REPLACE FUNCTION public.gp_guardar_horas_proyecto(p_proyecto_id uuid, p_filas jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sesión vencida. Recargá la página e iniciá sesión.' USING ERRCODE = '42501';
  END IF;
  IF NOT (public.has_permission('crear_proyecto') OR public.has_permission('editar_proyecto')) THEN
    RAISE EXCEPTION 'Sin permiso para guardar horas del proyecto.' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.gp_proyecto p WHERE p.id = p_proyecto_id) THEN
    RAISE EXCEPTION 'El proyecto no existe.';
  END IF;

  DELETE FROM public.gp_proyecto_hora WHERE proyecto_id = p_proyecto_id;

  INSERT INTO public.gp_proyecto_hora (proyecto_id, fecha, horas, observaciones, created_by)
  SELECT p_proyecto_id,
         (x->>'fecha')::date,
         ROUND((x->>'horas')::numeric, 2),
         NULLIF(btrim(x->>'observaciones'), ''),
         auth.uid()
  FROM jsonb_array_elements(COALESCE(p_filas, '[]'::jsonb)) AS x
  WHERE COALESCE((x->>'horas')::numeric, 0) > 0
    AND COALESCE((x->>'horas')::numeric, 0) <= 9999
    AND NULLIF(btrim(x->>'fecha'), '') IS NOT NULL;
END;
$$;

GRANT EXECUTE ON FUNCTION public.gp_guardar_horas_proyecto(uuid, jsonb) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.gp_guardar_horas_proyecto(uuid, jsonb) FROM PUBLIC;

COMMENT ON TABLE public.gp_proyecto_hora IS
  'Horas consumidas propias del proyecto por fecha (Argentina). El total del proyecto es estas filas más gp_entregable_hora y gp_tarea_hora.';
COMMENT ON COLUMN public.gp_proyecto_hora.observaciones IS 'Nota libre de esa carga de horas (fecha de negocio Argentina).';
COMMENT ON FUNCTION public.gp_guardar_horas_proyecto(uuid, jsonb) IS
  'Reemplaza las horas propias del proyecto. SECURITY DEFINER para no chocar RLS/FK de created_by.';
