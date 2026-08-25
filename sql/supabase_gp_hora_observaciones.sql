-- Fornitalia – Observaciones en cada carga de horas (tarea y entregable).
-- Una fila de horas = fecha + horas + observaciones. Homogéneo en ambos formularios.
-- Ejecutar después de sql/supabase_gp_observaciones_y_horas_rls.sql.

ALTER TABLE public.gp_tarea_hora ADD COLUMN IF NOT EXISTS observaciones text;
ALTER TABLE public.gp_entregable_hora ADD COLUMN IF NOT EXISTS observaciones text;

COMMENT ON COLUMN public.gp_tarea_hora.observaciones IS 'Nota libre de esa carga de horas (fecha de negocio Argentina).';
COMMENT ON COLUMN public.gp_entregable_hora.observaciones IS 'Nota libre de esa carga de horas propias del entregable.';

CREATE OR REPLACE FUNCTION public.gp_guardar_horas_tarea(p_tarea_id uuid, p_filas jsonb)
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
    RAISE EXCEPTION 'Sin permiso para guardar horas de la tarea.' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.gp_tarea t WHERE t.id = p_tarea_id) THEN
    RAISE EXCEPTION 'La tarea no existe.';
  END IF;

  DELETE FROM public.gp_tarea_hora WHERE tarea_id = p_tarea_id;

  INSERT INTO public.gp_tarea_hora (tarea_id, fecha, horas, observaciones, created_by)
  SELECT p_tarea_id,
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

CREATE OR REPLACE FUNCTION public.gp_guardar_horas_entregable(p_entregable_id uuid, p_filas jsonb)
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
    RAISE EXCEPTION 'Sin permiso para guardar horas del entregable.' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.gp_entregable e WHERE e.id = p_entregable_id) THEN
    RAISE EXCEPTION 'El entregable no existe.';
  END IF;

  DELETE FROM public.gp_entregable_hora WHERE entregable_id = p_entregable_id;

  INSERT INTO public.gp_entregable_hora (entregable_id, fecha, horas, observaciones, created_by)
  SELECT p_entregable_id,
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

GRANT EXECUTE ON FUNCTION public.gp_guardar_horas_tarea(uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.gp_guardar_horas_entregable(uuid, jsonb) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.gp_guardar_horas_tarea(uuid, jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.gp_guardar_horas_entregable(uuid, jsonb) FROM PUBLIC;
